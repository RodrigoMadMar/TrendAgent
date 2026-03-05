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
        max_tokens: 1500,
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
            content: `Monitorea campañas recientes de competidores logísticos en Chile: ${competitorList}.

Realiza estas 4 búsquedas:
1. Busca "Chilexpress campaña promoción redes sociales 2026"
2. Busca "Starken Chile promoción descuento envíos 2026"
3. Busca "Correos de Chile campaña Instagram Twitter 2026"
4. Busca "Chilexpress Starken Correos Chile courier promoción marzo 2026"

Para cada campaña o publicación detectada devuelve:
{
  "competitor": "Chilexpress" | "Starken" | "Correos de Chile",
  "platform": "Instagram" | "X" | "TikTok",
  "type": "promo" | "campaña" | "orgánico" | "alianza" | "branding",
  "summary": "qué publicaron (1-2 frases)",
  "copy": "copy aproximado o null",
  "engagement": "alto" | "medio" | "bajo",
  "date": "fecha aproximada",
  "opportunity": "oportunidad para Blue Express o null"
}

Devuelve entre 4 y 8 items. Responde ÚNICAMENTE con el JSON array.`,
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
