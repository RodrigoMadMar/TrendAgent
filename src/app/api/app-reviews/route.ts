import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";
import { getClient, createWithRetry } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const APPS = [
  {
    name: "Chilexpress",
    id: "cl.chilexpress.chilexpress",
    color: "#FF6B00",
  },
  {
    name: "Starken",
    id: "cl.starken.movil",
    color: "#E31837",
  },
];

/* ─────────────────────────────────────────────────────────
   Playwright: navega a Google Play Store y toma screenshot
   de la sección de reviews (showAllReviews=true abre la vista
   de todas las reseñas directamente).
───────────────────────────────────────────────────────── */
async function screenshotApp(appId: string): Promise<string | null> {
  const url = `https://play.google.com/store/apps/details?id=${appId}&showAllReviews=true&hl=es_CL&gl=CL`;

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    // Scroll para cargar las reviews del panel
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(2000);

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: false,
    });

    return buffer.toString("base64");
  } catch (err) {
    console.error(`Screenshot failed for ${appId}:`, (err as Error).message);
    return null;
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
   Claude visión: extrae datos estructurados del screenshot
   de Play Store (rating, reviews, issues, praises)
───────────────────────────────────────────────────────── */
async function extractFromScreenshot(
  b64: string,
  appName: string
): Promise<any> {
  const client = getClient();

  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: b64,
              },
            },
            {
              type: "text",
              text: `Este es un screenshot de Google Play Store mostrando las reseñas de la app ${appName} en Chile.

Extrae TODOS los datos visibles con precisión. Devuelve SOLO este JSON (sin markdown):
{
  "rating": número_decimal (ej: 2.8),
  "totalReviews": "texto visible como 50K+ opiniones",
  "recentSentiment": "positivo"|"mixto"|"negativo",
  "topIssues": ["problema1", "problema2", "problema3", "problema4"],
  "topPraises": ["elogio1", "elogio2"],
  "recentReviews": [
    {
      "author": "nombre del autor si visible",
      "text": "texto completo de la reseña tal como aparece",
      "rating": número_1_a_5,
      "date": "fecha tal como aparece",
      "sentiment": "positivo"|"negativo"|"neutro"
    }
  ]
}

Incluye TODAS las reseñas visibles (al menos 5 si hay). topIssues y topPraises deben reflejar los temas reales mencionados en las reseñas.`,
            },
          ],
        },
      ],
    })
  );

  const text = (response.content[0] as Anthropic.TextBlock).text;
  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON from Claude vision");
  return JSON.parse(clean.slice(s, e + 1));
}

/* ─────────────────────────────────────────────────────────
   Claude genera insight y oportunidad desde los datos de ambas apps
───────────────────────────────────────────────────────── */
async function generateInsightAndOpportunity(apps: any[]): Promise<{
  insight: string;
  opportunity: string;
}> {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Análisis de competencia en Chile (apps de courier):
${apps
  .map(
    (a) =>
      `${a.name}: rating ${a.rating}, sentiment ${a.recentSentiment}, issues: ${a.topIssues?.join(", ")}`
  )
  .join("\n")}

Devuelve SOLO este JSON:
{"insight":"frase de insight para Blue Express máx 120 chars","opportunity":"oportunidad de campaña específica máx 150 chars"}`,
        },
      ],
    })
  );

  const text = (response.content[0] as Anthropic.TextBlock).text;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1) return { insight: "", opportunity: "" };
  return JSON.parse(text.slice(s, e + 1));
}

/* ─────────────────────────────────────────────────────────
   Handler: procesa ambas apps secuencialmente para no
   sobrecargar la memoria (dos browsers simultáneos en Vercel
   puede ser problemático en el plan gratuito)
───────────────────────────────────────────────────────── */
export async function POST() {
  const results: any[] = [];

  for (const app of APPS) {
    try {
      const b64 = await screenshotApp(app.id);
      if (!b64) throw new Error("Screenshot vacío");

      const extracted = await extractFromScreenshot(b64, app.name);

      results.push({
        name: app.name,
        color: app.color,
        rating: typeof extracted.rating === "number" ? extracted.rating : parseFloat(extracted.rating) || 0,
        totalReviews: extracted.totalReviews ?? "N/A",
        recentSentiment: extracted.recentSentiment ?? "mixto",
        topIssues: Array.isArray(extracted.topIssues)
          ? extracted.topIssues.slice(0, 4)
          : [],
        topPraises: Array.isArray(extracted.topPraises)
          ? extracted.topPraises.slice(0, 3)
          : [],
        recentReviews: Array.isArray(extracted.recentReviews)
          ? extracted.recentReviews.slice(0, 6).map((r: any) => ({
              author: r.author ?? "",
              text: r.text ?? "",
              rating: r.rating ?? 3,
              date: r.date ?? "",
              sentiment: r.sentiment ?? "neutro",
            }))
          : [],
      });
    } catch (err) {
      console.error(`App ${app.name} failed:`, (err as Error).message);
      results.push({
        name: app.name,
        color: app.color,
        rating: 0,
        totalReviews: "N/A",
        recentSentiment: "mixto",
        topIssues: [],
        topPraises: [],
        recentReviews: [],
        error: (err as Error).message,
      });
    }
  }

  const { insight, opportunity } = await generateInsightAndOpportunity(
    results
  ).catch(() => ({ insight: "", opportunity: "" }));

  return NextResponse.json({
    apps: results,
    insight,
    opportunity,
    scannedAt: new Date().toISOString(),
  });
}
