import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";
import { getClient, createWithRetry } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const APPS = [
  { name: "Chilexpress", id: "cl.chilexpress.chilexpress", color: "#FF6B00" },
  { name: "Starken", id: "cl.starken.movil", color: "#E31837" },
];

/* ─────────────────────────────────────────────────────────
   Playwright navega Play Store y toma screenshot.
   Los selectores de clase de Google Play cambian con cada
   deploy → screenshot + Claude vision es más robusto que
   selectores DOM hardcodeados.
───────────────────────────────────────────────────────── */
async function screenshotApp(appId: string): Promise<string> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

    // showAllReviews=true abre directamente el panel de reseñas
    const url = `https://play.google.com/store/apps/details?id=${appId}&showAllReviews=true&hl=es_CL&gl=CL`;

    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
    } catch {
      // El timeout parcial no impide que el contenido sea visible
    }

    await page.waitForTimeout(4000);

    // Scroll para cargar más reseñas
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);

    const buffer = await page.screenshot({ type: "jpeg", quality: 80 });
    return buffer.toString("base64");
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
   Claude vision extrae datos estructurados del screenshot.
   Este patrón ya funciona en /api/meta-ads (misma técnica).
───────────────────────────────────────────────────────── */
async function extractWithVision(b64: string, appName: string): Promise<any> {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64 },
          },
          {
            type: "text",
            text: `Este screenshot muestra la página de reseñas de ${appName} en Google Play Store Chile.

Extrae EXACTAMENTE lo que ves (no inventes nada). Devuelve SOLO este JSON (sin markdown):
{
  "rating": número_decimal_visible (ej: 2.8),
  "totalReviews": "texto visible de cantidad (ej: 50K+)",
  "recentSentiment": "positivo"|"mixto"|"negativo",
  "topIssues": ["problema visible en reseñas 1","problema 2","problema 3"],
  "topPraises": ["elogio visible 1","elogio 2"],
  "recentReviews": [
    {
      "author": "nombre del autor si visible",
      "text": "texto COMPLETO de la reseña tal como aparece en pantalla",
      "rating": número_1_a_5_de_las_estrellas,
      "date": "fecha tal como aparece",
      "sentiment": "positivo"|"negativo"|"neutro"
    }
  ]
}

Incluye todas las reseñas visibles (mínimo 3 si hay). Si un campo no es visible, usa null.`,
          },
        ],
      }],
    })
  );

  const text = (response.content[0] as Anthropic.TextBlock).text;
  const clean = text.replace(/```json?/g, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON from Claude vision");
  return JSON.parse(clean.slice(s, e + 1));
}

async function generateInsightAndOpportunity(apps: any[]) {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Apps de courier competidoras en Chile (Play Store):
${apps.map((a) => `${a.name}: rating ${a.rating}, issues: ${(a.topIssues ?? []).join(", ")}`).join("\n")}

Devuelve SOLO este JSON:
{"insight":"frase de insight para Blue Express máx 120 chars","opportunity":"oportunidad de campaña específica máx 150 chars"}`,
      }],
    })
  );
  const text = (response.content[0] as Anthropic.TextBlock).text;
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1) return { insight: "", opportunity: "" };
  return JSON.parse(text.slice(s, e + 1));
}

export async function POST() {
  const results: any[] = [];

  // Procesamos secuencialmente para no saturar memoria con 2 browsers
  for (const app of APPS) {
    try {
      const b64 = await screenshotApp(app.id);
      const extracted = await extractWithVision(b64, app.name);

      results.push({
        name: app.name,
        color: app.color,
        rating: typeof extracted.rating === "number" ? extracted.rating : parseFloat(extracted.rating) || 0,
        totalReviews: extracted.totalReviews ?? "N/A",
        recentSentiment: extracted.recentSentiment ?? "mixto",
        topIssues: Array.isArray(extracted.topIssues) ? extracted.topIssues.slice(0, 4) : [],
        topPraises: Array.isArray(extracted.topPraises) ? extracted.topPraises.slice(0, 3) : [],
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
      console.error(`${app.name} failed:`, (err as Error).message);
      results.push({
        name: app.name,
        color: app.color,
        rating: 0,
        totalReviews: "N/A",
        recentSentiment: "mixto" as const,
        topIssues: [],
        topPraises: [],
        recentReviews: [],
        error: (err as Error).message,
      });
    }
  }

  const { insight, opportunity } = await generateInsightAndOpportunity(results).catch(
    () => ({ insight: "", opportunity: "" })
  );

  return NextResponse.json({
    apps: results,
    insight,
    opportunity,
    scannedAt: new Date().toISOString(),
    source: "play.google.com",
  });
}
