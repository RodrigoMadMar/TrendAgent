import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { BRAND, type RawTrend } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { trends }: { trends: RawTrend[] } = await req.json();

    if (!trends?.length) {
      return NextResponse.json({ error: "No trends provided" }, { status: 400 });
    }

    const client = getClient();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 4000,
      system: `Eres un analista senior de Growth Marketing para Blue Express (servicio de envíos y logística de Copec, Chile).

Manual de marca Blue Express:
- Pilares: ${BRAND.pillars.join(", ")}
- Tono: ${BRAND.tone}
- Audiencia: ${BRAND.audience.join(", ")}
- Evitar: ${BRAND.avoidances.join(", ")}
- Códigos activos: ENVIOGRATIS (primer envío gratis), BLUECOPEC20 (20% descuento retención)

Tu trabajo: evaluar tendencias y generar propuestas de campaña reactiva creíbles y ejecutables.

Responde SOLO con JSON válido. Sin markdown, sin backticks, sin texto adicional.`,
      messages: [
        {
          role: "user",
          content: `Analiza estas ${trends.length} tendencias y genera scoring + propuestas de campaña para Blue Express.

Tendencias:
${JSON.stringify(trends, null, 2)}

Para CADA tendencia devuelve:
{
  "title": "título original",
  "source": "fuente original",
  "sourceIcon": "𝕏" para X/Twitter, "📰" para noticias/farándula, "📊" para datos,
  "category": "categoría",
  "summary": "resumen",
  "relevanceScore": 1-10,
  "viralScore": 1-10,
  "brandFitScore": 1-10,
  "timingWindow": "Xh" o "X días",
  "effort": "S" | "M" | "L",
  "campaigns": [
    {
      "title": "nombre creativo",
      "channel": "Push + Email" | "Paid Social" | "Instagram + TikTok" | "Push" | "Full funnel" | "Email",
      "copy": "texto de comunicación",
      "cta": "call to action",
      "estimatedReach": "estimación"
    }
  ]
}

Reglas:
- 2-3 propuestas por tendencia
- Solo incluir tendencias con relevanceScore >= 4
- Copys deben respetar tono de marca
- Si aplica, usar códigos ENVIOGRATIS o BLUECOPEC20
- Sé creativo pero realista

Responde ÚNICAMENTE con el JSON array.`,
        },
      ],
    });

    const texts = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    let scored: any[] = [];
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) scored = JSON.parse(match[0]);
    } catch (e) {
      console.error("Score parse error:", e);
    }

    // Add IDs, vote counts, mock volume
    const enriched = scored.map((t: any, i: number) => ({
      ...t,
      id: i + 1,
      timestamp: "Ahora",
      volume: Math.floor(Math.random() * 80000) + 5000,
      velocity: `+${Math.floor(Math.random() * 400) + 50}%`,
      campaigns: (t.campaigns || []).map((c: any, j: number) => ({
        ...c,
        id: `c${i}-${j}`,
        votes: 0,
      })),
    }));

    return NextResponse.json({ trends: enriched });
  } catch (error: any) {
    console.error("Score error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to score trends" },
      { status: 500 }
    );
  }
}
