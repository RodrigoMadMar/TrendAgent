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
        system: `Eres un scraper de tendencias chilenas. Tu trabajo es buscar las tendencias actuales más relevantes de X/Twitter en Chile, noticias de farándula/entretenimiento chileno, y tendencias de búsqueda de Google Trends Chile.

Responde SOLO con un JSON array válido. Sin markdown, sin backticks, sin explicaciones. Solo el JSON.`,
        messages: [
          {
            role: "user",
            content: `Busca las tendencias actuales en Chile usando estas búsquedas:

1. Busca "trending topics Chile hoy Twitter X" para los trending topics del momento
2. Busca "farándula chilena noticias hoy" para titulares de entretenimiento
3. Busca "limalimon.cl noticias hoy" para LimaLimón
4. Busca "trends24.in chile" para confirmar tendencias de X
5. Busca "Google Trends Chile hoy tendencias búsquedas populares" para tendencias de búsqueda
6. Busca "qué buscan los chilenos hoy envío regalo compras online" para señales de demanda relevantes a logística y e-commerce

Para las búsquedas de Google Trends, presta especial atención a términos relacionados con:
- Envíos y logística: "enviar paquete", "courier Chile", "envío barato"
- E-commerce: "comprar online Chile", "tienda online", "marketplace Chile"
- Estacionalidad: regalos por fechas especiales, vuelta a clases, eventos comerciales
- Emprendimiento: "cómo vender online Chile", "emprendimiento Chile"

Para cada tendencia relevante que encuentres, devuelve:
{
  "title": "nombre de la tendencia o titular",
  "source": "X Trending" | "LimaLimón" | "Farándula Chile" | "Noticias" | "Google Trends",
  "category": "Entretenimiento" | "Farándula" | "Deportes" | "Música" | "Reality" | "Negocios" | "Estacional" | "E-commerce" | "Logística" | otra,
  "summary": "resumen de 1-2 frases. Para Google Trends, incluye el % de crecimiento si está disponible."
}

Devuelve entre 7 y 10 tendencias en total (incluyendo al menos 2-3 de Google Trends si encuentras señales relevantes). Prioriza las que tengan potencial de engagement o comercial.
Responde ÚNICAMENTE con el JSON array.`,
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
