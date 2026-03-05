import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { TEAM, NOTION_DBS, getTasksForChannel, offsetDate } from "@/lib/constants";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { campaign, trend, sprint, deployDate } = await req.json();

    if (!campaign || !trend || !sprint || !deployDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const tasks = getTasksForChannel(campaign.channel);
    const client = getClient();

    const taskList = tasks
      .map((t) => {
        const owner = TEAM[t.ownerKey];
        return `- ${t.name} [campaignName]: Líder "${owner.id}" (${owner.name}), Etiqueta "${t.tag}", Fecha de deploy: "${offsetDate(deployDate, t.offsetDays)}"`;
      })
      .join("\n");

    const prompt = `Crea una campaña Blue Express y sus tareas en Notion.

## CAMPAÑA
- Database data_source_id: "${NOTION_DBS.campanas}"
- Nombre: "📦 Blue: ${campaign.title}"
- Objetivo: trx
- Líder: "${TEAM.rodrigo.id}" (Rodrigo Madariaga)
- Status: "Refinamiento"
- Busca el Sprint "${sprint}" en la base de Sprints (collection://${NOTION_DBS.sprints}) con patrón "Células ${sprint}"
- Busca el Negocio "blueExpress" en la base de Negocios (collection://${NOTION_DBS.negocios})
- Fecha start: "${deployDate}"

Contenido de la página:
# Resumen
**Tendencia origen:** ${trend.title} (${trend.source})
**Mensaje principal:** ${campaign.copy}
**CTA:** ${campaign.cta}
**Canal:** ${campaign.channel}
**Alcance estimado:** ${campaign.estimatedReach}
**Ventana de oportunidad:** ${trend.timingWindow || "48h"}

# Contexto
${trend.summary}

# Scoring Trend Scout
- Relevancia: ${trend.relevanceScore}/10
- Viralidad: ${trend.viralScore}/10
- Brand Fit: ${trend.brandFitScore}/10

## TAREAS (DB data_source_id: "${NOTION_DBS.tareas}")
Cada tarea: mismo Sprint y Negocio que la campaña, Status "Backlog", vinculada a la campaña creada.

${taskList}

INSTRUCCIONES:
1. Busca primero el Sprint y el Negocio Blue Express
2. Crea la campaña
3. Crea TODAS las tareas vinculadas
4. Responde con un resumen de lo creado`;

    // Use the Anthropic SDK with beta for MCP
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system:
          "Crea campañas y tareas en Notion usando las herramientas MCP. Busca Sprint y Negocio primero, crea campaña, luego tareas vinculadas.",
        messages: [{ role: "user", content: prompt }],
        mcp_servers: [
          {
            type: "url",
            url: "https://mcp.notion.com/mcp",
            name: "notion",
          },
        ],
      }),
    });

    const data = await response.json();

    // Extract created URLs from response
    const textContent = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return NextResponse.json({
      success: true,
      message: textContent,
      raw: data,
    });
  } catch (error: any) {
    console.error("Notion push error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create in Notion" },
      { status: 500 }
    );
  }
}
