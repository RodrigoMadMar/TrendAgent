import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, createWithRetry } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";

export const maxDuration = 120;

/* ════════════════════════════════════════════
   FUENTE 1: Google Trends RSS (sin Claude)
════════════════════════════════════════════ */

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

  while ((m = itemRe.exec(xml)) !== null && trends.length < 15) {
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
      ? stripTags(stripCDATA(rawSummary)).substring(0, 250)
      : "Tendencia activa en búsquedas Google Chile";

    trends.push({ title, source: "Google Trends", category: "Google Trends", summary, volume: traffic });
  }
  return trends;
}

/* ════════════════════════════════════════════
   FUENTE 2: X/Twitter — trends24.in + fallback Claude
════════════════════════════════════════════ */

function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (/fútbol|futbol|copa|gol|selección|colo|universidad de chile|hockey/.test(t)) return "Deportes / Fútbol";
  if (/viña|festival|farándula|farandula|bailando/.test(t)) return "Entretenimiento / Farándula";
  if (/serie|netflix|disney|hbo|\btv\b|canal/.test(t)) return "Entretenimiento / TV";
  if (/gobierno|boric|congreso|senado|cámara|ley /.test(t)) return "Política";
  if (/economía|precio|dólar|inflación|\buf\b/.test(t)) return "Economía";
  return "Trending";
}

function parseTrends24(html: string): any[] {
  const trends: any[] = [];
  const names: string[] = [];
  const counts: string[] = [];
  let m: RegExpExecArray | null;

  const nameRe = /<p[^>]*class="[^"]*trend-name[^"]*"[^>]*>([^<]+)<\/p>/g;
  const countRe = /<p[^>]*class="[^"]*tweet-count[^"]*"[^>]*>([^<]+)<\/p>/g;
  while ((m = nameRe.exec(html)) !== null) names.push(m[1].trim());
  while ((m = countRe.exec(html)) !== null) counts.push(m[1].trim());

  const top = names.slice(0, 15);
  for (let i = 0; i < top.length; i++) {
    const title = top[i];
    trends.push({
      title,
      source: "X Trending",
      category: detectCategory(title),
      summary: `Trending en X Chile en tiempo real. Posición #${i + 1} en trends24.in/chile`,
      volume: counts[i] || "N/A",
    });
  }

  // Fallback: links con /chile/
  if (!trends.length) {
    const linkRe = /href="\/chile\/[^"]*"[^>]*title="([^"]+)"/g;
    while ((m = linkRe.exec(html)) !== null && trends.length < 15) {
      const title = m[1].trim();
      if (title && title !== "Chile") {
        trends.push({ title, source: "X Trending", category: detectCategory(title), summary: `Trending en X Chile`, volume: "N/A" });
      }
    }
  }

  return trends;
}

async function fetchXTrends(): Promise<any[]> {
  // Intento 1: scraping trends24.in (sin Claude)
  try {
    const res = await fetch("https://trends24.in/chile/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      const trends = parseTrends24(html);
      if (trends.length) return trends;
    }
  } catch {
    // continúa al fallback
  }

  // Intento 2: Claude web_search
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        tools: [{ type: "web_search_20250305", name: "web_search" } as any],
        system: "Responde SOLO con JSON array. Sin markdown, sin texto adicional.",
        messages: [{
          role: "user",
          content: `Busca "trending Chile Twitter hoy" y lista los trending topics actuales.
Devuelve SOLO este JSON array:
[{"title":"#Tema","summary":"razón en 1 frase"}]
Máximo 12 items. SOLO el array.`,
        }],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    )
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("");

  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("Claude no retornó trending topics de X");

  const raw: any[] = JSON.parse(clean.slice(s, e + 1));
  return raw.filter(t => t.title).map((t) => ({
    title: t.title,
    source: "X Trending",
    category: detectCategory(t.title),
    summary: t.summary || "",
    volume: "N/A",
  }));
}

/* ════════════════════════════════════════════
   STEP 2: Scoring en UNA llamada Claude
   (NO usa web_search — solo recibe datos ya obtenidos)
════════════════════════════════════════════ */

async function scoreAll(twitterRaw: any[], googleRaw: any[]) {
  const allRaw = [
    ...twitterRaw.map((t) => ({ ...t, _src: "twitter" })),
    ...googleRaw.map((t) => ({ ...t, _src: "google" })),
  ];
  if (!allRaw.length) return { twitter: [], google: [] };

  // Guardamos los títulos para separar el resultado sin depender de que Claude preserve _src
  const twitterTitles = new Set(twitterRaw.map((t) => t.title.toLowerCase().trim()));

  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: `Eres analista de Growth Marketing para Blue Express (logística Copec Chile).
Pilares: ${BRAND.pillars.join(", ")} | Tono: ${BRAND.tone} | Audiencia: ${BRAND.audience.join(", ")} | Evitar: ${BRAND.avoidances.join(", ")} | Códigos promo: ENVIOGRATIS, BLUECOPEC20.
Responde SOLO con JSON array. Sin markdown, sin texto extra.`,
      messages: [{
        role: "user",
        content: `Evalúa estas ${allRaw.length} tendencias de Chile para Blue Express.

${JSON.stringify(allRaw.map(t => ({ title: t.title, source: t.source, summary: t.summary })), null, 2)}

Devuelve un JSON array. Por cada tendencia con relevanceScore >= 4:
{
  "title": "título exacto como vino",
  "source": "fuente exacta",
  "sourceIcon": "𝕏" para X Trending, "📊" para Google Trends,
  "category": "categoría",
  "summary": "resumen",
  "relevanceScore": número 1-10,
  "viralScore": número 1-10,
  "brandFitScore": número 1-10,
  "timingWindow": "Xh" o "X días",
  "effort": "S" o "M" o "L",
  "campaigns": [
    {
      "title": "nombre campaña",
      "channel": "Email" o "Push" o "Push + Email" o "Instagram Post" o "Instagram Story" o "Instagram + TikTok" o "TikTok" o "Paid Social" o "SMS" o "Full funnel",
      "copy": "texto",
      "cta": "call to action",
      "estimatedReach": "estimación"
    }
  ]
}

Incluye 2 campañas por tendencia. Usa ENVIOGRATIS o BLUECOPEC20 cuando aplique.
RESPONDE ÚNICAMENTE CON EL ARRAY JSON.`,
      }],
    })
  );

  const texts = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text).join("");

  const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) {
    console.error("scoreAll: no JSON array found in response. Preview:", texts.slice(0, 300));
    return { twitter: [], google: [] };
  }

  const scored: any[] = JSON.parse(clean.slice(s, e + 1));

  // Separar por título (no depende de que Claude devuelva _src)
  const twitter = scored.filter((t) => twitterTitles.has(t.title?.toLowerCase().trim()));
  const google = scored.filter((t) => !twitterTitles.has(t.title?.toLowerCase().trim()));

  return { twitter, google };
}

/* ════════════════════════════════════════════
   Handler principal
════════════════════════════════════════════ */

function enrich(arr: any[], prefix: string) {
  return arr.map((t: any, i: number) => ({
    ...t,
    id: i + 1,
    timestamp: "Ahora",
    volume: Math.floor(Math.random() * 80000) + 5000,
    velocity: `+${Math.floor(Math.random() * 400) + 50}%`,
    campaigns: (t.campaigns || []).map((c: any, j: number) => ({ ...c, id: `${prefix}${i}-${j}`, votes: 0 })),
  }));
}

export async function POST() {
  try {
    // Paso 1: ambas fuentes en paralelo (Google RSS + trends24.in/fallback Claude)
    const [googleRaw, twitterRaw] = await Promise.all([
      fetchGoogleTrends().catch((e) => { console.error("Google RSS error:", e.message); return []; }),
      fetchXTrends().catch((e) => { console.error("X trends error:", e.message); return []; }),
    ]);

    console.log(`scan: googleRaw=${googleRaw.length}, twitterRaw=${twitterRaw.length}`);

    // Paso 2: scoring en una sola llamada Claude (secuencial → sin rate limit)
    const { twitter, google } = await scoreAll(twitterRaw, googleRaw);

    console.log(`scan: scored twitter=${twitter.length}, google=${google.length}`);

    return NextResponse.json({
      twitter: enrich(twitter, "t"),
      google: enrich(google, "g"),
      _debug: { googleRaw: googleRaw.length, twitterRaw: twitterRaw.length },
    });
  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: error.message || "Error al escanear tendencias" }, { status: 500 });
  }
}
