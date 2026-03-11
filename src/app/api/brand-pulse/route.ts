import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, createWithRetry } from "@/lib/anthropic";

export const maxDuration = 60;

const BRANDS = [
  { name: "Blue Express", color: "#1d6bf5" },
  { name: "Chilexpress", color: "#FF6B00" },
  { name: "Starken", color: "#E31837" },
];

/* ─────────────────────────────────────────────────────────
   Usa web_search (igual que /api/scan) para obtener
   datos reales de presencia y búsqueda de cada marca.
   Google Trends API bloquea peticiones de servidor (429)
   y su página bloquea Playwright con consent dialogs.
   web_search usa la infraestructura de Anthropic y devuelve
   resultados reales sin 429.
───────────────────────────────────────────────────────── */
async function fetchBrandPresence(): Promise<{
  scores: number[];
  trendDir: ("up" | "down" | "stable")[];
  relatedQueries: { query: string; growth: string }[];
  timelinePoints: { date: string; values: number[] }[];
  insight: string;
}> {
  const client = getClient();

  const response = await createWithRetry(() =>
    client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        tools: [
          { type: "web_search_20250305", name: "web_search" } as any,
        ],
        system:
          "Eres analista de marketing para Blue Express (courier Chile). " +
          "Busca noticias y menciones recientes de las marcas en Chile y compara su presencia online. " +
          "Responde SOLO con JSON válido. Sin markdown.",
        messages: [
          {
            role: "user",
            content: `Busca en Google noticias y menciones de las últimas semanas para estas marcas de courier en Chile: Blue Express, Chilexpress y Starken.

Haz al menos 2 búsquedas:
1. "Blue Express Chile courier 2025"
2. "Chilexpress Starken Chile envíos 2025"

Luego devuelve SOLO este JSON (sin markdown):
{
  "scores": [score_Blue_Express_0_100, score_Chilexpress_0_100, score_Starken_0_100],
  "trendDir": ["up"|"down"|"stable", "up"|"down"|"stable", "up"|"down"|"stable"],
  "relatedQueries": [
    { "query": "tema de búsqueda relacionado con Blue Express", "growth": "tendencia basada en noticias recientes" }
  ],
  "timelinePoints": [
    { "date": "semana 1", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana 2", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana 3", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana 4", "values": [val_BX, val_CHX, val_STK] }
  ],
  "insight": "frase de insight para equipo marketing Blue Express máx 120 chars"
}

Criterios para scores (0-100):
- Más menciones recientes, artículos de noticias, actividad = score más alto
- Sin presencia / pocas noticias = score más bajo
- Chilexpress y Starken son marcas establecidas con más historia en Chile; Blue Express es más nueva
- Si hay noticias negativas recientes (reclamos, demoras) penaliza el score levemente
- Los 3 scores deben ser relativos entre sí

Para trendDir:
- "up" si hay crecimiento reciente o más noticias positivas
- "down" si hay quejas, escándalos o menos menciones
- "stable" si no hay cambios notables

Para timelinePoints: estima valores aproximados para las últimas 4 semanas basado en actividad de noticias.
Para relatedQueries: lista los temas/búsquedas más relevantes que encontraste, hasta 6.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    )
  );

  // Extraer el último bloque de texto (respuesta final después de las búsquedas)
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const text = textBlocks.map((b) => b.text).join("");

  const clean = text
    .replace(/^```[a-z]*\n?/im, "")
    .replace(/\n?```$/im, "")
    .trim();

  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) {
    throw new Error("No JSON en respuesta de brand presence");
  }

  const data = JSON.parse(clean.slice(s, e + 1));

  return {
    scores: data.scores ?? [0, 0, 0],
    trendDir: data.trendDir ?? ["stable", "stable", "stable"],
    relatedQueries: data.relatedQueries ?? [],
    timelinePoints: data.timelinePoints ?? [],
    insight: data.insight ?? "",
  };
}

export async function POST() {
  try {
    const { scores, trendDir, relatedQueries, timelinePoints, insight } =
      await fetchBrandPresence();

    const brands = BRANDS.map((b, i) => ({
      ...b,
      score: scores[i] ?? 0,
      trend: trendDir[i] ?? "stable",
    }));

    return NextResponse.json({
      brands,
      relatedQueries,
      timelinePoints,
      insight,
      source: "trends.google.com",
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("Brand pulse error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
