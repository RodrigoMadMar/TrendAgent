import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, createWithRetry } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";

export const maxDuration = 120;

/* ── Google Trends RSS (no Claude needed) ── */

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

/* ── Single Claude call: X search + score everything ── */

const SCORE_SCHEMA = `{
  "title": string,
  "source": string,
  "sourceIcon": "𝕏" | "📊" | "📰",
  "category": string,
  "summary": string,
  "relevanceScore": 1-10,
  "viralScore": 1-10,
  "brandFitScore": 1-10,
  "timingWindow": string,
  "effort": "S" | "M" | "L",
  "campaigns": [{ "title": string, "channel": "Email"|"Push"|"Push + Email"|"Instagram Post"|"Instagram Story"|"Instagram + TikTok"|"TikTok"|"Paid Social"|"SMS"|"Full funnel", "copy": string, "cta": string, "estimatedReach": string }]
}`;

export async function POST() {
  try {
    // 1. Fetch Google Trends RSS (fast, no Claude)
    let googleRaw: any[] = [];
    try {
      googleRaw = await fetchGoogleTrends();
    } catch (e) {
      console.warn("Google RSS failed, continuing without it:", e);
    }

    // 2. ONE Claude call: search X trends + score everything
    const client = getClient();

    const response = await createWithRetry(() =>
      client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 6000,
          tools: [{ type: "web_search_20250305", name: "web_search" } as any],
          system: `Eres un analista senior de Growth Marketing para Blue Express (envíos y logística de Copec, Chile).
Manual de marca: Pilares: ${BRAND.pillars.join(", ")} | Tono: ${BRAND.tone} | Audiencia: ${BRAND.audience.join(", ")} | Evitar: ${BRAND.avoidances.join(", ")} | Códigos: ENVIOGRATIS (primer envío gratis), BLUECOPEC20 (20% retención).
Responde SOLO con JSON válido. Sin markdown, sin texto adicional.`,
          messages: [
            {
              role: "user",
              content: `Haz lo siguiente en un solo paso:

1. Busca "trending topics X Twitter Chile hoy" para obtener los 10-15 temas más trending ahora en Chile.

2. Evalúa para Blue Express TANTO las tendencias de X que encuentres COMO estas tendencias de Google Trends Chile (ya recopiladas):
${googleRaw.length ? JSON.stringify(googleRaw.map(t => ({ title: t.title, summary: t.summary, volume: t.volume })), null, 2) : "(sin datos de Google Trends)"}

3. Devuelve SOLO este JSON (sin markdown):
{
  "twitter": [ /* tendencias de X/Twitter evaluadas, solo relevanceScore >= 4 */ ],
  "google": [ /* tendencias de Google evaluadas, solo relevanceScore >= 4 */ ]
}

Cada tendencia con este esquema (2-3 campañas por tendencia):
${SCORE_SCHEMA}

Reglas:
- sourceIcon: "𝕏" para X/Twitter, "📊" para Google Trends
- Solo tendencias con relevanceScore >= 4
- 2-3 campañas por tendencia, copys en tono Blue Express
- Usar ENVIOGRATIS o BLUECOPEC20 si aplica
- Para Google Trends: viralScore menor pero relevanceScore y brandFitScore pueden ser altos`,
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

    let twitter: any[] = [];
    let google: any[] = [];

    try {
      const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const parsed = JSON.parse(clean.slice(start, end + 1));
        twitter = parsed.twitter || [];
        google = parsed.google || [];
      }
    } catch (e) {
      console.error("Parse error in /api/scan:", e);
      console.error("Raw text preview:", text.substring(0, 500));
    }

    // Enrich with IDs, timestamps, mock metrics
    const enrich = (arr: any[], prefix: string) =>
      arr.map((t: any, i: number) => ({
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

    return NextResponse.json({
      twitter: enrich(twitter, "t"),
      google: enrich(google, "g"),
    });
  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: error.message || "Error al escanear tendencias" }, { status: 500 });
  }
}
