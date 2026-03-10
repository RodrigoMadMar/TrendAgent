import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, createWithRetry } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";

export const maxDuration = 120;

/* ── Step 1a: Google Trends RSS ── */

function stripCDATA(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "").trim();
}

async function fetchGoogleTrends(): Promise<any[]> {
  const res = await fetch("https://trends.google.com/trending/rss?geo=CL&hours=24", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Trends RSS: ${res.status}`);
  const xml = await res.text();

  const trends: any[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && trends.length < 20) {
    const item = m[1];
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const trafficMatch = item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    const snippetMatch = item.match(/<ht:news_item_snippet>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:news_item_snippet>/);
    const newsTitleMatch = item.match(/<ht:news_item_title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:news_item_title>/);
    if (!titleMatch) continue;

    const title = stripCDATA(titleMatch[1]);
    const traffic = trafficMatch ? trafficMatch[1].trim() : "N/A";
    const rawSummary = snippetMatch ? snippetMatch[1] : newsTitleMatch ? newsTitleMatch[1] : "";
    const summary = rawSummary
      ? stripTags(stripCDATA(rawSummary)).substring(0, 300)
      : "Tendencia activa en búsquedas Google Chile — últimas 24 horas";

    trends.push({ title, source: "Google Trends", category: "Google Trends", summary, volume: traffic });
  }
  return trends;
}

/* ── Step 1b: X/Twitter trends via Claude web_search (simple: just titles) ── */

async function fetchXTrends(): Promise<any[]> {
  const client = getClient();

  const response = await createWithRetry(() =>
    client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" } as any],
        system: "Responde SOLO con un JSON array válido. Sin markdown, sin explicaciones.",
        messages: [
          {
            role: "user",
            content: `Busca "trending Twitter Chile hoy" y devuelve los trending topics actuales de X/Twitter Chile.

Responde ÚNICAMENTE con este JSON array (sin markdown):
[{"title":"#TrendOTema","summary":"por qué está trending en 1 frase","volume":"N/A"}]

Máximo 12 items. Solo el array JSON.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    )
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return [];

  const raw: any[] = JSON.parse(clean.slice(start, end + 1));
  return raw.map((t) => ({
    title: t.title || "",
    source: "X Trending",
    category: "Trending",
    summary: t.summary || "",
    volume: t.volume || "N/A",
  }));
}

/* ── Step 2: Score all trends in ONE Claude call ── */

async function scoreAll(
  twitterRaw: any[],
  googleRaw: any[]
): Promise<{ twitter: any[]; google: any[] }> {
  if (!twitterRaw.length && !googleRaw.length) return { twitter: [], google: [] };

  const client = getClient();
  const allRaw = [
    ...twitterRaw.map((t) => ({ ...t, _src: "twitter" })),
    ...googleRaw.map((t) => ({ ...t, _src: "google" })),
  ];

  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      system: `Eres analista de Growth Marketing para Blue Express (logística Copec Chile).
Marca: Pilares: ${BRAND.pillars.join(", ")} | Tono: ${BRAND.tone} | Audiencia: ${BRAND.audience.join(", ")} | Evitar: ${BRAND.avoidances.join(", ")} | Códigos: ENVIOGRATIS, BLUECOPEC20.
Responde SOLO con JSON array válido. Sin markdown.`,
      messages: [
        {
          role: "user",
          content: `Evalúa estas ${allRaw.length} tendencias para Blue Express y devuelve el JSON array.

${JSON.stringify(allRaw.map((t) => ({ title: t.title, source: t.source, summary: t.summary, _src: t._src })), null, 2)}

Para CADA tendencia (solo relevanceScore >= 4), devuelve:
{"title":string,"source":string,"sourceIcon":"𝕏" si _src=twitter sino "📊","category":string,"summary":string,"_src":string,"relevanceScore":1-10,"viralScore":1-10,"brandFitScore":1-10,"timingWindow":string,"effort":"S"|"M"|"L","campaigns":[{"title":string,"channel":"Email"|"Push"|"Push + Email"|"Instagram Post"|"Instagram Story"|"Instagram + TikTok"|"TikTok"|"Paid Social"|"SMS"|"Full funnel","copy":string,"cta":string,"estimatedReach":string}]}

Reglas: 2-3 campañas por tendencia. Usa ENVIOGRATIS o BLUECOPEC20 si aplica.
Responde ÚNICAMENTE con el JSON array.`,
        },
      ],
    })
  );

  const texts = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return { twitter: [], google: [] };

  const scored: any[] = JSON.parse(clean.slice(start, end + 1));
  const twitter = scored.filter((t) => t._src === "twitter");
  const google = scored.filter((t) => t._src === "google");
  return { twitter, google };
}

/* ── Main handler ── */

function enrich(arr: any[], prefix: string) {
  return arr.map((t: any, i: number) => ({
    ...t,
    id: i + 1,
    timestamp: "Ahora",
    volume: Math.floor(Math.random() * 80000) + 5000,
    velocity: `+${Math.floor(Math.random() * 400) + 50}%`,
    campaigns: (t.campaigns || []).map((c: any, j: number) => ({
      ...c,
      id: `${prefix}${i}-${j}`,
      votes: 0,
    })),
  }));
}

export async function POST() {
  try {
    // Step 1: Fetch Google RSS and X trends in parallel (X uses Claude web_search)
    const [googleRaw, twitterRaw] = await Promise.all([
      fetchGoogleTrends().catch((e) => { console.warn("Google RSS failed:", e); return []; }),
      fetchXTrends().catch((e) => { console.warn("X trends failed:", e); return []; }),
    ]);

    // Step 2: Score all in one Claude call (sequential, no rate limit overlap)
    const { twitter, google } = await scoreAll(twitterRaw, googleRaw);

    return NextResponse.json({
      twitter: enrich(twitter, "t"),
      google: enrich(google, "g"),
    });
  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: error.message || "Error al escanear tendencias" }, { status: 500 });
  }
}
