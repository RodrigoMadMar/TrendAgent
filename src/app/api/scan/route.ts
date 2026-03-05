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
            content: `Hoy es ${new Date().toLocaleDateString("es-CL", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Busca tendencias REALES de las últimas 24-72 horas en Chile usando estas búsquedas:

1. Visita "https://trends24.in/chile/" y extrae los hashtags/temas que aparecen como trending ahora mismo en X/Twitter Chile
2. Busca en noticias recientes de emol.com, biobiochile.cl y meganoticias.cl los titulares de las últimas horas
3. Busca "site:limalimon.cl" para ver los últimos artículos publicados en LimaLimón Chile
4. Visita "https://trends.google.com/trends/trendingsearches/daily?geo=CL" para ver las búsquedas en tendencia en Google Chile hoy
5. Busca eventos, lanzamientos y noticias virales de las últimas 48 horas en Chile (deportes, música, política, farándula, economía)

IMPORTANTE: Solo reporta tendencias y noticias CONCRETAS y RECIENTES (últimas 72 horas). No inventes ni uses conocimiento previo. Si encuentras un trending topic específico (ej: "#NombrePersona", "Nombre Evento"), repórtalo tal como está. NO reportes categorías genéricas como "compras online" o "Mercado Libre envío gratis" a menos que haya un evento o noticia específica y reciente que lo justifique.

Para cada tendencia concreta que encuentres, devuelve:
{
  "title": "nombre exacto de la tendencia, hashtag o titular",
  "source": "X Trending" | "LimaLimón" | "Farándula Chile" | "Noticias" | "Google Trends",
  "category": "Entretenimiento" | "Farándula" | "Deportes" | "Música" | "Reality" | "Negocios" | "Estacional" | "E-commerce" | "Logística" | otra,
  "summary": "qué está pasando exactamente, con contexto concreto. Para Google Trends, incluye el volumen o % de crecimiento si está disponible."
}

Devuelve entre 7 y 10 tendencias en total (incluyendo al menos 2-3 de Google Trends reales del día). Prioriza las más recientes y con mayor volumen de conversación.
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
