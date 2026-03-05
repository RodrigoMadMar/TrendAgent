import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { BRAND, COMPETITORS, type CompetitorPost } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { posts }: { posts: CompetitorPost[] } = await req.json();

    if (!posts?.length) {
      return NextResponse.json({ error: "No posts provided" }, { status: 400 });
    }

    const client = getClient();

    const competitorNames = COMPETITORS.map((c) => c.name).join(", ");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `Eres un analista senior de Growth Marketing e Inteligencia Competitiva para Blue Express (servicio de envíos y logística de Copec, Chile).

Contexto Blue Express:
- Pilares de marca: ${BRAND.pillars.join(", ")}
- Tono: ${BRAND.tone}
- Audiencia: ${BRAND.audience.join(", ")}
- Evitar: ${BRAND.avoidances.join(", ")}
- Códigos activos: ENVIOGRATIS (primer envío gratis), BLUECOPEC20 (20% descuento retención)

Competidores a analizar: ${competitorNames}

Tu trabajo: analizar las publicaciones recientes de los competidores y detectar oportunidades reactivas para Blue Express.

Responde SOLO con JSON válido. Sin markdown, sin backticks, sin texto adicional.`,
      messages: [
        {
          role: "user",
          content: `Analiza estas ${posts.length} publicaciones recientes de competidores y genera un análisis competitivo para Blue Express.

Publicaciones detectadas:
${JSON.stringify(posts, null, 2)}

Devuelve exactamente este JSON:
{
  "competitors": [
    {
      "name": "nombre del competidor",
      "activityLevel": "alto" | "medio" | "bajo",
      "mainFocus": "qué están empujando principalmente (1 línea)",
      "promos": ["lista de promociones o descuentos activos detectados"],
      "toneShift": "si hay cambio de tono o posicionamiento notable, describir en 1 línea. null si no hay cambio.",
      "posts": [array de posts de este competidor del input, sin modificar]
    }
  ],
  "opportunities": [
    {
      "title": "nombre corto de la oportunidad reactiva",
      "trigger": "qué hizo el competidor que genera esta oportunidad",
      "suggestion": "qué podría hacer Blue Express para capitalizar esto (2-3 líneas concretas)",
      "urgency": "alta" | "media" | "baja",
      "channel": "Push + Email" | "Paid Social" | "Instagram Post" | "Instagram Story" | "Instagram + TikTok" | "Email" | "Push" | "Full funnel"
    }
  ],
  "summary": "resumen ejecutivo de 2-3 líneas del panorama competitivo actual y la posición relativa de Blue Express"
}

Reglas:
- Incluir los 3 competidores aunque no haya posts de alguno (activityLevel: "bajo", arreglo posts vacío)
- Máximo 4 oportunidades, ordenadas por urgencia (alta primero)
- Las oportunidades deben ser concretas y ejecutables por el equipo de marketing
- Si los competidores están haciendo algo que Blue Express ya hace bien, mencionarlo en el summary

Responde ÚNICAMENTE con el JSON objeto.`,
        },
      ],
    });

    const texts = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
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
      console.error("Competitors analyze parse error:", e);
      console.error("Raw text preview:", texts.substring(0, 800));
    }

    return NextResponse.json(analysis || { competitors: [], opportunities: [], summary: "" });
  } catch (error: any) {
    console.error("Competitors analyze error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze competitors" },
      { status: 500 }
    );
  }
}
