import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";

export const maxDuration = 60;

export async function POST() {
  // 1. Try trends24.in scraping first
  try {
    const res = await fetch("https://trends24.in/chile/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const html = await res.text();
      const trends = parseTrends24(html);
      if (trends.length) {
        return NextResponse.json({
          trends,
          source: "trends24.in",
          fetchedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // fall through to Claude web_search fallback
  }

  // 2. Fallback: Claude with web_search for real-time X/Twitter Chile trends
  try {
    const client = getClient();
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search" } as any],
        system: `Eres un asistente especializado en tendencias de redes sociales en Chile. Responde SOLO con JSON válido, sin markdown, sin texto adicional.`,
        messages: [
          {
            role: "user",
            content: `Busca los trending topics actuales en X (Twitter) Chile de hoy. Usa búsquedas como "trending Chile Twitter hoy" o "tendencias X Chile".

Devuelve un JSON array con los 15 temas más trending:
[
  {
    "title": "#NombreDelTrend o Tema",
    "source": "X Trending",
    "category": "categoría del tema",
    "summary": "breve descripción de por qué está trending (1 frase)",
    "volume": "N/A"
  }
]

Categorías posibles: Deportes / Fútbol, Entretenimiento / Farándula, Entretenimiento / TV, Política, Economía, Trending.
SOLO el JSON array.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let trends: any[] = [];
    try {
      const match = text.replace(/```json?/g, "").replace(/```/g, "").trim();
      const start = match.indexOf("[");
      const end = match.lastIndexOf("]");
      if (start !== -1 && end !== -1) trends = JSON.parse(match.slice(start, end + 1));
    } catch {
      throw new Error("No se pudo parsear la respuesta de Claude");
    }

    if (!trends.length) throw new Error("Claude no encontró trending topics");

    return NextResponse.json({
      trends,
      source: "X Trending (web_search)",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("scan-twitter error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function detectCategory(title: string): string {
  const t = title.toLowerCase();
  if (
    t.includes("fútbol") ||
    t.includes("futbol") ||
    t.includes("copa") ||
    t.includes("gol") ||
    t.includes("selección") ||
    t.includes("colo") ||
    t.includes("universidad de chile") ||
    t.includes("hockey") ||
    t.includes("qualifier")
  )
    return "Deportes / Fútbol";
  if (
    t.includes("viña") ||
    t.includes("festival") ||
    t.includes("farándula") ||
    t.includes("farandula") ||
    t.includes("bailando")
  )
    return "Entretenimiento / Farándula";
  if (
    t.includes("serie") ||
    t.includes("netflix") ||
    t.includes("disney") ||
    t.includes("hbo") ||
    t.includes("tv") ||
    t.includes("canal")
  )
    return "Entretenimiento / TV";
  if (
    t.includes("gobierno") ||
    t.includes("boric") ||
    t.includes("congreso") ||
    t.includes("senado") ||
    t.includes("cámara") ||
    t.includes("ley ")
  )
    return "Política";
  if (
    t.includes("economía") ||
    t.includes("precio") ||
    t.includes("dólar") ||
    t.includes("inflación") ||
    t.includes("uf")
  )
    return "Economía";
  return "Trending";
}

function parseTrends24(html: string) {
  const trends: any[] = [];

  // Primary pattern: <p class="trend-name">#Hashtag</p>
  const nameRe = /<p[^>]*class="[^"]*trend-name[^"]*"[^>]*>([^<]+)<\/p>/g;
  const countRe = /<p[^>]*class="[^"]*tweet-count[^"]*"[^>]*>([^<]+)<\/p>/g;

  const names: string[] = [];
  const counts: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = nameRe.exec(html)) !== null) names.push(m[1].trim());
  while ((m = countRe.exec(html)) !== null) counts.push(m[1].trim());

  // Take first 20 (most recent card)
  const top = names.slice(0, 20);

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

  // Fallback: look for title attribute in links with /chile/ path
  if (!trends.length) {
    const linkRe = /href="\/chile\/[^"]*"[^>]*title="([^"]+)"/g;
    while ((m = linkRe.exec(html)) !== null && trends.length < 20) {
      const title = m[1].trim();
      if (title && title !== "Chile") {
        trends.push({
          title,
          source: "X Trending",
          category: detectCategory(title),
          summary: `Trending en X Chile - trends24.in/chile`,
          volume: "N/A",
        });
      }
    }
  }

  // Second fallback: any <a> with /chile/ in href and short text
  if (!trends.length) {
    const re2 = /<a[^>]+href="\/chile\/([^/"]{2,60})\/"[^>]*>([^<]{2,80})<\/a>/g;
    while ((m = re2.exec(html)) !== null && trends.length < 20) {
      const title = m[2].trim();
      if (title && !title.includes("Ver más") && !title.includes("Chile")) {
        trends.push({
          title,
          source: "X Trending",
          category: detectCategory(title),
          summary: `Trending en X Chile - trends24.in/chile`,
          volume: "N/A",
        });
      }
    }
  }

  return trends;
}
