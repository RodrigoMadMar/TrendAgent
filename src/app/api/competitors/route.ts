import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";

export const maxDuration = 120;

export async function POST() {
  try {
    const client = getClient();
    const today = new Date().toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          } as any,
        ],
        system: `Eres un analista de inteligencia competitiva para Blue Express, empresa de logística y envíos de Chile. Analiza la actividad reciente en redes sociales de los competidores directos. Responde SOLO con JSON válido, sin markdown ni texto adicional.`,
        messages: [
          {
            role: "user",
            content: `Hoy es ${today}. Analiza la actividad reciente en redes sociales de los principales competidores logísticos chilenos de Blue Express.

Haz estas búsquedas:
1. "Chilexpress Instagram publicaciones recientes 2025" — busca sus últimas campañas y posts
2. "Chilexpress Twitter X Chile 2025" — busca tweets recientes y promociones
3. "Starken Instagram publicaciones recientes 2025" — busca sus últimas campañas
4. "Starken Twitter X Chile 2025" — busca tweets recientes y promociones
5. "Chilexpress promociones descuentos ${today}" — busca ofertas activas
6. "Starken promociones descuentos ${today}" — busca ofertas activas

Con lo que encuentres, genera EXACTAMENTE este JSON sin markdown ni texto adicional:
{
  "competitors": [
    {
      "name": "Chilexpress",
      "activityLevel": "alto" | "medio" | "bajo",
      "mainFocus": "qué están empujando actualmente (1 línea)",
      "promos": ["lista de promos/descuentos encontrados"],
      "toneShift": "cambio de tono notable respecto a lo habitual, o null",
      "posts": [
        {
          "competitor": "Chilexpress",
          "platform": "Instagram" | "X",
          "type": "promo" | "campaña" | "orgánico" | "branding",
          "summary": "descripción del contenido del post (1-2 frases)",
          "copy": "texto del post encontrado o null",
          "engagement": "alto" | "medio" | "bajo",
          "date": "fecha del post o 'reciente'",
          "opportunity": "oportunidad específica para Blue Express o null"
        }
      ]
    },
    {
      "name": "Starken",
      "activityLevel": "...",
      "mainFocus": "...",
      "promos": [],
      "toneShift": null,
      "posts": []
    }
  ],
  "opportunities": [
    {
      "title": "nombre corto de la oportunidad reactiva",
      "trigger": "qué publicó el competidor que genera esta oportunidad",
      "suggestion": "qué puede hacer Blue Express concreto (2-3 líneas)",
      "urgency": "alta" | "media" | "baja",
      "channel": "Push + Email" | "Paid Social" | "Instagram + TikTok" | "Email" | "Push" | "Full funnel"
    }
  ],
  "summary": "resumen ejecutivo 2-3 líneas del panorama competitivo actual"
}

Contexto Blue Express: pilares ${BRAND.pillars.join(", ")}, tono ${BRAND.tone}, audiencia ${BRAND.audience.join(", ")}.
Máximo 4 oportunidades ordenadas por urgencia. SOLO JSON.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    );

    const texts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    let analysis: any = { competitors: [], opportunities: [], summary: "" };
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
    } catch (e) {
      console.error("Competitors parse error:", e, "\nRaw:", texts.slice(0, 400));
    }

    return NextResponse.json({ ...analysis, screenshots: [] });
  } catch (error: any) {
    console.error("Competitors route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan competitors" },
      { status: 500 }
    );
  }
}
