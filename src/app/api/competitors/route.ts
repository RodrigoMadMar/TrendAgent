import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";
import { BRAND, COMPETITORS } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    const client = getClient();

    const competitorList = COMPETITORS.map((c) => `${c.name} (${c.x} / ${c.ig})`).join(", ");

    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          } as any,
        ],
        system: `Eres un analista de inteligencia competitiva para Blue Express (servicio de envíos y logística de Copec, Chile).
Marca Blue Express: pilares ${BRAND.pillars.join(", ")}, tono ${BRAND.tone}, audiencia ${BRAND.audience.join(", ")}.
Responde SOLO con un JSON objeto válido. Sin markdown, sin backticks, sin explicaciones.`,
        messages: [
          {
            role: "user",
            content: `Monitorea las campañas recientes de los competidores logísticos chilenos: ${competitorList}.

Haz 3 búsquedas:
1. "Chilexpress Starken campaña promoción envíos Chile 2026"
2. "Correos de Chile promoción descuento courier 2026"
3. "courier Chile Instagram TikTok campaña marzo 2026"

Luego analiza todo lo encontrado y devuelve EXACTAMENTE este JSON objeto:
{
  "competitors": [
    {
      "name": "Chilexpress",
      "activityLevel": "alto" | "medio" | "bajo",
      "mainFocus": "qué están empujando (1 línea)",
      "promos": ["promos activas detectadas"],
      "toneShift": "cambio de tono notable o null",
      "posts": [
        {
          "competitor": "Chilexpress",
          "platform": "Instagram" | "X" | "TikTok",
          "type": "promo" | "campaña" | "orgánico" | "branding",
          "summary": "qué publicaron (1-2 frases)",
          "copy": "copy aproximado o null",
          "engagement": "alto" | "medio" | "bajo",
          "date": "fecha aproximada",
          "opportunity": "oportunidad para Blue Express o null"
        }
      ]
    },
    { "name": "Starken", ... },
    { "name": "Correos de Chile", ... }
  ],
  "opportunities": [
    {
      "title": "nombre corto de la oportunidad",
      "trigger": "qué hizo el competidor",
      "suggestion": "qué puede hacer Blue Express (2-3 líneas)",
      "urgency": "alta" | "media" | "baja",
      "channel": "Push + Email" | "Paid Social" | "Instagram Post" | "Instagram Story" | "Instagram + TikTok" | "Email" | "Push" | "Full funnel"
    }
  ],
  "summary": "resumen ejecutivo de 2-3 líneas del panorama competitivo"
}

Incluye los 3 competidores aunque no haya posts (activityLevel: "bajo", posts: []). Máximo 3 oportunidades. Responde ÚNICAMENTE con el JSON objeto.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    );

    const texts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    let analysis: any = null;
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        analysis = JSON.parse(clean.slice(start, end + 1));
      }
    } catch (e) {
      console.error("Parse error in /api/competitors:", e);
      console.error("Raw text:", texts.substring(0, 500));
    }

    return NextResponse.json(analysis || { competitors: [], opportunities: [], summary: "" });
  } catch (error: any) {
    console.error("Competitors error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan competitors" },
      { status: 500 }
    );
  }
}
