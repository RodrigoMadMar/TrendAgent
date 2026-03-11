import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";
import { getClient, createWithRetry } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const BRANDS = [
  { name: "Blue Express", color: "#1d6bf5" },
  { name: "Chilexpress", color: "#FF6B00" },
  { name: "Starken", color: "#E31837" },
];

/* ─────────────────────────────────────────────────────────
   Playwright carga Google Trends con las 3 marcas y
   toma screenshot. Claude vision extrae los datos del
   gráfico. Mismo patrón que /api/app-reviews (funciona).
   No usamos HTTP API porque Google devuelve 429 desde
   entornos de servidor.
───────────────────────────────────────────────────────── */
async function screenshotTrends(): Promise<string> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "es-CL,es;q=0.9",
    });

    const url =
      "https://trends.google.com/trends/explore" +
      "?q=Blue+Express,Chilexpress,Starken" +
      "&geo=CL&date=today+1-m&hl=es";

    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
    } catch {
      // timeout parcial — el contenido visual puede estar listo igual
    }

    // Esperar a que el gráfico renderice
    await page.waitForTimeout(5000);

    // Scroll leve para asegurar que todo esté visible
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(1000);

    const buffer = await page.screenshot({ type: "jpeg", quality: 85 });
    return buffer.toString("base64");
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
   Claude vision lee el gráfico de Google Trends y extrae
   datos estructurados (scores, tendencias, consultas).
───────────────────────────────────────────────────────── */
async function extractWithVision(b64: string): Promise<{
  scores: number[];
  trendDir: ("up" | "down" | "stable")[];
  relatedQueries: { query: string; growth: string }[];
  timelinePoints: { date: string; values: number[] }[];
}> {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: b64 },
            },
            {
              type: "text",
              text: `Este screenshot muestra Google Trends Chile comparando Blue Express, Chilexpress y Starken (últimos 30 días).

Extrae EXACTAMENTE lo que ves en la pantalla. Devuelve SOLO este JSON (sin markdown):
{
  "scores": [número_Blue_Express_0_100, número_Chilexpress_0_100, número_Starken_0_100],
  "trendDir": ["up"|"down"|"stable", "up"|"down"|"stable", "up"|"down"|"stable"],
  "timelinePoints": [
    { "date": "semana_1", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana_2", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana_3", "values": [val_BX, val_CHX, val_STK] },
    { "date": "semana_4", "values": [val_BX, val_CHX, val_STK] }
  ],
  "relatedQueries": [
    { "query": "búsqueda_relacionada_1", "growth": "+XX%" },
    { "query": "búsqueda_relacionada_2", "growth": "+XX%" }
  ]
}

Instrucciones:
- scores: promedio de la línea en el gráfico (0=sin datos, 100=máximo interés). Si no puedes leer el valor exacto, estima según la altura relativa de la línea.
- trendDir: "up" si la línea sube al final, "down" si baja, "stable" si es plana.
- timelinePoints: 4 puntos aproximados leyendo el gráfico de izquierda a derecha. Usa "semana 1", "semana 2", etc. si no hay fechas visibles.
- relatedQueries: las búsquedas del panel "Consultas relacionadas" si están visibles. Máximo 6.
- Si la página muestra un error o CAPTCHA, devuelve scores [0,0,0] y arrays vacíos.`,
            },
          ],
        },
      ],
    })
  );

  const raw = (response.content[0] as Anthropic.TextBlock).text.trim();
  // Limpiar posible markdown
  const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const data = JSON.parse(jsonStr);

  return {
    scores: data.scores ?? [0, 0, 0],
    trendDir: data.trendDir ?? ["stable", "stable", "stable"],
    relatedQueries: data.relatedQueries ?? [],
    timelinePoints: data.timelinePoints ?? [],
  };
}

async function generateInsight(
  brands: { name: string; score: number; trend: string }[],
  relatedQueries: { query: string; growth: string }[]
): Promise<string> {
  const client = getClient();
  const res = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Google Trends Chile 30 días:
${brands.map((b) => `${b.name}: ${b.score}/100, tendencia ${b.trend}`).join("\n")}
Consultas en ascenso Blue Express: ${
            relatedQueries.map((q) => `"${q.query}" ${q.growth}`).join(", ") ||
            "sin datos"
          }
Una frase de insight para el equipo de marketing de Blue Express (máx 120 chars). Sin comillas.`,
        },
      ],
    })
  );
  return (res.content[0] as Anthropic.TextBlock).text.trim();
}

export async function POST() {
  try {
    const b64 = await screenshotTrends();
    const { scores, trendDir, relatedQueries, timelinePoints } =
      await extractWithVision(b64);

    const brands = BRANDS.map((b, i) => ({
      ...b,
      score: scores[i] ?? 0,
      trend: trendDir[i] ?? "stable",
    }));

    const insight = await generateInsight(brands, relatedQueries).catch(
      () => ""
    );

    return NextResponse.json({
      brands,
      relatedQueries,
      timelinePoints,
      insight,
      source: "trends.google.com",
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("Brand pulse error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
