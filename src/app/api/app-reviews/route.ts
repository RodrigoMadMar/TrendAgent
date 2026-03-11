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
   Extrae rating/count del JSON-LD estructurado (exacto,
   sin depender de vision) y hace screenshot del panel
   de reseñas para que vision extraiga los textos.
───────────────────────────────────────────────────────── */
async function loadAndExtract(
  appId: string,
  appName: string
): Promise<{
  rating: number;
  totalReviews: string;
  recentSentiment: "positivo" | "mixto" | "negativo";
  topIssues: string[];
  topPraises: string[];
  recentReviews: any[];
}> {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

    // ── Paso 1: página principal — obtener rating exacto del JSON-LD ──
    const mainUrl = `https://play.google.com/store/apps/details?id=${appId}&hl=es_CL&gl=CL`;
    try {
      await page.goto(mainUrl, { waitUntil: "load", timeout: 30000 });
    } catch {
      // timeout parcial — el HTML con JSON-LD puede estar disponible
    }
    await page.waitForTimeout(3000);

    // Extraer aggregateRating del JSON-LD (siempre presente en el HTML estático)
    const structuredRating = await page.evaluate(() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      );
      for (const s of scripts) {
        try {
          const d = JSON.parse(s.textContent ?? "");
          if (d.aggregateRating) {
            return {
              value: parseFloat(d.aggregateRating.ratingValue ?? "0"),
              count: parseInt(d.aggregateRating.ratingCount ?? "0", 10),
            };
          }
        } catch {}
      }
      return null;
    });

    const rating = structuredRating?.value
      ? Math.round(structuredRating.value * 10) / 10
      : 0;
    const totalReviews = structuredRating?.count
      ? structuredRating.count >= 1000
        ? `${(structuredRating.count / 1000).toFixed(1)}K`
        : String(structuredRating.count)
      : "N/A";

    // ── Paso 2: navegar al panel de reseñas para screenshots ──
    const reviewsUrl = `https://play.google.com/store/apps/details?id=${appId}&hl=es_CL&gl=CL&showAllReviews=true`;
    try {
      await page.goto(reviewsUrl, { waitUntil: "load", timeout: 30000 });
    } catch {
      // continuar con lo que cargó
    }
    await page.waitForTimeout(5000);

    // Tomar screenshot del panel de reseñas
    const b64 = (
      await page.screenshot({ type: "jpeg", quality: 80 })
    ).toString("base64");

    // ── Paso 3: vision extrae SOLO textos de reseñas (rating ya está exacto) ──
    const reviewData = await extractReviewsWithVision(b64, appName);

    return { rating, totalReviews, ...reviewData };
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
   Vision extrae SOLO el contenido textual de reseñas.
   El rating numérico ya viene del JSON-LD (exacto), por eso
   NO se pide aquí para evitar alucinaciones.
───────────────────────────────────────────────────────── */
async function extractReviewsWithVision(
  b64: string,
  appName: string
): Promise<{
  recentSentiment: "positivo" | "mixto" | "negativo";
  topIssues: string[];
  topPraises: string[];
  recentReviews: any[];
}> {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
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
              text: `Este screenshot muestra el panel de reseñas de ${appName} en Google Play Store.

Extrae el contenido textual de las reseñas visibles. Devuelve SOLO JSON válido sin markdown:
{
  "recentSentiment": "mixto",
  "topIssues": ["problema 1 mencionado en reseñas", "problema 2"],
  "topPraises": ["elogio 1 mencionado en reseñas", "elogio 2"],
  "recentReviews": [
    {
      "author": "Nombre del usuario",
      "text": "Texto completo de la reseña",
      "rating": 3,
      "date": "fecha visible",
      "sentiment": "negativo"
    }
  ]
}

Reglas:
- NO incluyas el rating global de la app (eso ya lo tenemos de otra fuente).
- "recentSentiment": basado en el tono general de las reseñas visibles — "positivo", "mixto" o "negativo".
- "recentReviews[].rating": estrellas de ESA reseña individual (1-5). Si no ves estrellas individuales usa null.
- Incluye TODAS las reseñas visibles en pantalla, hasta 8.
- Si la pantalla no muestra reseñas, devuelve arrays vacíos y recentSentiment "mixto".`,
            },
          ],
        },
      ],
    })
  );

  const text = (response.content[0] as Anthropic.TextBlock).text;
  const clean = text
    .replace(/^```[a-z]*\n?/im, "")
    .replace(/\n?```$/im, "")
    .trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1) {
    return {
      recentSentiment: "mixto",
      topIssues: [],
      topPraises: [],
      recentReviews: [],
    };
  }

  const d = JSON.parse(clean.slice(s, e + 1));
  return {
    recentSentiment: d.recentSentiment ?? "mixto",
    topIssues: Array.isArray(d.topIssues) ? d.topIssues.slice(0, 4) : [],
    topPraises: Array.isArray(d.topPraises) ? d.topPraises.slice(0, 3) : [],
    recentReviews: Array.isArray(d.recentReviews)
      ? d.recentReviews.slice(0, 8).map((r: any) => ({
          author: r.author ?? "",
          text: r.text ?? "",
          rating: r.rating ?? null,
          date: r.date ?? "",
          sentiment: r.sentiment ?? "neutro",
        }))
      : [],
  };
}

async function generateInsightAndOpportunity(apps: any[]) {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Apps de courier competidoras en Chile (Play Store):
${apps
  .map(
    (a) =>
      `${a.name}: rating ${a.rating}/5 (${a.totalReviews} reseñas), issues: ${(
        a.topIssues ?? []
      ).join(", ")}`
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

export async function POST() {
  const results: any[] = [];

  // Procesamos secuencialmente para no saturar memoria con 2 browsers
  for (const app of APPS) {
    try {
      const data = await loadAndExtract(app.id, app.name);
      results.push({
        name: app.name,
        color: app.color,
        ...data,
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

  const { insight, opportunity } = await generateInsightAndOpportunity(
    results
  ).catch(() => ({ insight: "", opportunity: "" }));

  return NextResponse.json({
    apps: results,
    insight,
    opportunity,
    scannedAt: new Date().toISOString(),
    source: "play.google.com",
  });
}
