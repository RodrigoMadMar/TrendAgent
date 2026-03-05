import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";
import { COMPETITORS } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    const client = getClient();

    const competitorList = COMPETITORS.map((c) => `${c.name} (${c.x} / ${c.ig})`).join(", ");

    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          } as any,
        ],
        system: `Eres un analista de inteligencia competitiva para Blue Express (servicio de envíos y logística de Copec, Chile). Tu trabajo es monitorear las publicaciones recientes de los competidores directos en redes sociales.

Responde SOLO con un JSON array válido. Sin markdown, sin backticks, sin explicaciones. Solo el JSON.`,
        messages: [
          {
            role: "user",
            content: `Monitorea las publicaciones recientes de los competidores logísticos en Chile: ${competitorList}.

Realiza estas búsquedas:
1. Busca "Chilexpress Instagram publicaciones recientes 2026" para ver su actividad en IG
2. Busca "Chilexpress Twitter X campaña promoción 2026" para ver su actividad en X
3. Busca "Starken Instagram publicaciones recientes 2026" para ver su actividad en IG
4. Busca "Starken Chile Twitter campaña promoción 2026" para su actividad en X
5. Busca "Correos de Chile Instagram publicaciones recientes 2026" para su actividad en IG
6. Busca "Correos Chile Twitter campaña descuento 2026" para su actividad en X
7. Busca "Chilexpress Starken promoción envío Chile 2026" para detectar campañas activas
8. Busca "courier Chile campaña redes sociales TikTok 2026" para actividad en TikTok

Para cada publicación o campaña detectada, devuelve:
{
  "competitor": "Chilexpress" | "Starken" | "Correos de Chile",
  "platform": "Instagram" | "X" | "TikTok",
  "type": "promo" | "campaña" | "orgánico" | "alianza" | "branding",
  "summary": "descripción de qué publicaron o qué campaña están corriendo",
  "copy": "texto o copy aproximado si puedes extraerlo, o null si no",
  "engagement": "alto" | "medio" | "bajo",
  "date": "fecha aproximada (ej: 'esta semana', 'hace 3 días', 'marzo 2026')",
  "opportunity": "descripción de posible oportunidad reactiva para Blue Express, o null si no aplica"
}

Devuelve entre 6 y 12 items. Si no encuentras publicaciones recientes de algún competidor, igual incluye al menos 1 item con lo más reciente que encuentres.
Responde ÚNICAMENTE con el JSON array.`,
          },
        ],
      },
      { headers: { "anthropic-beta": "web-search-2025-03-05" } }
    );

    const texts = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    let posts: any[] = [];
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) posts = JSON.parse(match[0]);
    } catch (e) {
      console.error("Parse error in /api/competitors:", e);
      console.error("Raw text:", texts.substring(0, 500));
    }

    return NextResponse.json({ posts, raw_length: texts.length });
  } catch (error: any) {
    console.error("Competitors scan error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan competitors" },
      { status: 500 }
    );
  }
}
