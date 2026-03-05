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
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: `Eres un analista senior de Growth Marketing para Blue Express (servicio de envíos y logística de Copec, Chile).

Manual de marca Blue Express:
- Pilares: ${BRAND.pillars.join(", ")}
- Tono: ${BRAND.tone}
- Audiencia: ${BRAND.audience.join(", ")}
- Evitar: ${BRAND.avoidances.join(", ")}
- Códigos activos: ENVIOGRATIS (primer envío gratis), BLUECOPEC20 (20% descuento retención)

Tu trabajo: evaluar tendencias y generar propuestas de campaña reactiva creíbles y ejecutables.

Sobre tendencias de Google Trends:
- Representan intención de búsqueda activa, no solo conversación social
- Suelen tener ventanas de oportunidad más largas (días a semanas, no horas)
- Son especialmente relevantes si están relacionadas con envíos, regalos, compras online o emprendimiento
- Considéralas señales de demanda real: el usuario YA está buscando activamente
- Su viralScore suele ser menor (no son buzz en redes), pero relevanceScore y brandFitScore pueden ser altos
- El effort tiende a ser "M" o "L" porque son tendencias más sostenidas que requieren campaña estructurada

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
      "channel": "Email" | "Push" | "Push + Email" | "Instagram Post" | "Instagram Story" | "Instagram + TikTok" | "TikTok" | "Paid Social" | "SMS" | "Full funnel",
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
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    let scored: any[] = [];
    try {
      const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
      const start = clean.indexOf("[");
      const end = clean.lastIndexOf("]");
      if (start !== -1 && end !== -1 && end > start) {
        scored = JSON.parse(clean.slice(start, end + 1));
      }
    } catch (e) {
      console.error("Score parse error:", e);
      console.error("Raw text preview:", texts.substring(0, 800));
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
