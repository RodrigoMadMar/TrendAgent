import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  try {
    const client = getClient();

    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          } as any,
        ],
        system: `Eres un scraper de tendencias chilenas. Responde SOLO con JSON array válido, sin markdown ni explicaciones.`,
        messages: [
          {
            role: "user",
            content: `Fecha y hora actual: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}.

Haz estas búsquedas en orden para obtener tendencias REALES y ACTUALES de Chile:

1. Busca exactamente: "site:trends24.in/chile" — extrae los hashtags/temas que aparecen en la página ahora mismo
2. Busca: "trending twitter chile hoy ${new Date().toLocaleDateString("es-CL")}" — para confirmar tendencias actuales
3. Busca: "noticias chile viral hoy ${new Date().toLocaleDateString("es-CL")}" — noticias del día (farándula, deportes, política)

REGLAS ESTRICTAS:
- Reporta EXACTAMENTE lo que encuentres en los resultados de búsqueda, no lo que creas que debería estar trending
- Si trends24.in muestra "#DiaInternacionalDeLaMujer", incluye ESO, no otra cosa
- NO uses conocimiento previo de tendencias pasadas
- La fecha de hoy es ${new Date().toLocaleDateString("es-CL")} — todo debe ser de HOY

Devuelve 8-12 items. Formato SOLO JSON sin markdown:
[{"title":"...","source":"X Trending|Google Trends|Noticias","category":"...","summary":"...","volume":"..."}]`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    );

    // Extract text blocks
    const texts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // Parse JSON from response
    let trends: any[] = [];
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) trends = JSON.parse(match[0]);
    } catch (e) {
      console.error("Parse error in /api/scan:", e);
      console.error("Raw text:", texts.substring(0, 500));
    }

    return NextResponse.json({ trends, raw_length: texts.length });
  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan trends" },
      { status: 500 }
    );
  }
}
