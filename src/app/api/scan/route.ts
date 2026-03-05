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
            content: `Hoy ${new Date().toLocaleDateString("es-CL")}. Haz MÁXIMO 3 búsquedas para encontrar tendencias reales en Chile:
1. trends24.in/chile — trending X/Twitter Chile ahora
2. Google Trends Chile hoy — búsquedas populares del día
3. Noticias virales Chile últimas 48h (farándula, deportes, entretenimiento)

Devuelve 6-8 items. NO inventes, NO uses categorías genéricas sin evento concreto.
Formato: [{"title":"...","source":"X Trending|Google Trends|Noticias|LimaLimón","category":"...","summary":"..."}]`,
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
