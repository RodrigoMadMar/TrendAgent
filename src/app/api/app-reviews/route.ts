import { NextResponse } from "next/server";
import { getClient, createWithRetry } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

/* ─────────────────────────────────────────────────────────
   Claude web_search busca reviews de las apps de competidores
   en Google Play Store y las analiza con sentiment analysis.
───────────────────────────────────────────────────────── */
async function fetchAndAnalyzeReviews() {
  const client = getClient();

  const response = await createWithRetry(
    () =>
      client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 3500,
          tools: [
            { type: "web_search_20250305", name: "web_search" } as any,
          ],
          system: `Eres analista de inteligencia competitiva para Blue Express (logística Chile).
Tu tarea es buscar reviews de apps de competidores y extraer insights accionables.
Responde SOLO con JSON. Sin markdown, sin texto extra.`,
          messages: [
            {
              role: "user",
              content: `Busca las reviews y ratings actuales de estas apps en Google Play Store Chile:
1. Chilexpress: https://play.google.com/store/apps/details?id=cl.chilexpress.chilexpress&hl=es_CL
2. Starken: https://play.google.com/store/apps/details?id=cl.starken.movil&hl=es_CL

Busca también "Chilexpress app reviews opiniones 2025" y "Starken app reviews opiniones 2025".

Devuelve SOLO este JSON (sin markdown):
{
  "apps": [
    {
      "name": "Chilexpress",
      "rating": 3.1,
      "totalReviews": "45K",
      "recentSentiment": "mixto",
      "topIssues": ["paquetes perdidos", "atención al cliente"],
      "topPraises": ["cobertura nacional"],
      "recentReviews": [
        {"text": "texto review", "rating": 2, "date": "hace 3 días", "sentiment": "negativo"},
        {"text": "texto review", "rating": 4, "date": "hace 1 semana", "sentiment": "positivo"}
      ]
    },
    {
      "name": "Starken",
      "rating": 3.5,
      "totalReviews": "8K",
      "recentSentiment": "mixto",
      "topIssues": ["demoras", "app lenta"],
      "topPraises": ["precio"],
      "recentReviews": [
        {"text": "texto review", "rating": 3, "date": "hace 2 días", "sentiment": "neutro"}
      ]
    }
  ],
  "insight": "frase de insight para Blue Express (máx 120 chars)",
  "opportunity": "oportunidad de campaña específica basada en debilidades detectadas (máx 150 chars)"
}

Incluye al menos 3-5 recentReviews por app. recentSentiment debe ser "positivo", "mixto" o "negativo".`,
            },
          ],
        },
        { headers: { "anthropic-beta": "web-search-2025-03-05" } }
      ),
    2
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON from Claude");
  return JSON.parse(clean.slice(s, e + 1));
}

/* ─────────────────────────────────────────────────────────
   Handler
───────────────────────────────────────────────────────── */
export async function POST() {
  try {
    const data = await fetchAndAnalyzeReviews();

    // Normalise structure
    const apps = (data.apps ?? []).map((app: any) => ({
      name: app.name ?? "App",
      rating: typeof app.rating === "number" ? app.rating : parseFloat(app.rating) || 0,
      totalReviews: app.totalReviews ?? "N/A",
      recentSentiment: app.recentSentiment ?? "mixto",
      topIssues: Array.isArray(app.topIssues) ? app.topIssues.slice(0, 4) : [],
      topPraises: Array.isArray(app.topPraises) ? app.topPraises.slice(0, 3) : [],
      recentReviews: Array.isArray(app.recentReviews)
        ? app.recentReviews.slice(0, 5).map((r: any) => ({
            text: r.text ?? "",
            rating: r.rating ?? 3,
            date: r.date ?? "",
            sentiment: r.sentiment ?? "neutro",
          }))
        : [],
    }));

    return NextResponse.json({
      apps,
      insight: data.insight ?? "",
      opportunity: data.opportunity ?? "",
      scannedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("App reviews error:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener reviews" },
      { status: 500 }
    );
  }
}
