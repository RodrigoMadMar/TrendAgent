import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";

export const maxDuration = 60;

type Sentiment = "positivo" | "mixto" | "negativo";
type Review = { text: string; rating: number; date: string; sentiment: Sentiment };
type AppData = {
  name: string;
  color: string;
  appId: string;
  rating: number;
  totalReviews: string;
  recentSentiment: Sentiment;
  topIssues: string[];
  topPraises: string[];
  recentReviews: Review[];
};

const APPS = [
  { name: "Chilexpress", appId: "cl.chilexpress.chilexpress", color: "#FF6B00" },
  { name: "Starken", appId: "cl.starken.movil", color: "#E31837" },
];

const ISSUE_KEYWORDS: Record<string, string[]> = {
  "paquetes no entregados / extraviados": ["no llega", "no entreg", "extravi", "perdi", "pedido", "encomienda"],
  "atención al cliente deficiente": ["atención", "servicio", "cliente", "contact", "responde", "chat"],
  "app con errores y crashes": ["error", "falla", "crash", "bug", "no funciona", "cae"],
  "seguimiento impreciso": ["seguimiento", "tracking", "estado", "actualiza", "información"],
  "demoras en entrega": ["demora", "retras", "tard", "esper"],
};

const PRAISE_KEYWORDS: Record<string, string[]> = {
  "fácil de usar": ["fácil", "rapida", "rápida", "simple", "intuitiva"],
  "entregas rápidas": ["rápido", "puntual", "llego altiro", "a tiempo"],
  "buena cobertura": ["cobertura", "sucursal", "todo chile", "nacional"],
};

const normalize = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function inferSentiment(rating: number): Sentiment {
  if (rating >= 4) return "positivo";
  if (rating <= 2) return "negativo";
  return "mixto";
}

function computeThemes(
  reviews: Review[],
  dict: Record<string, string[]>,
  max = 4
): string[] {
  const score = new Map<string, number>();
  const texts = reviews.map((r) => normalize(r.text));
  for (const [theme, words] of Object.entries(dict)) {
    let hits = 0;
    for (const text of texts) {
      if (words.some((w) => text.includes(normalize(w)))) hits += 1;
    }
    if (hits > 0) score.set(theme, hits);
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([theme]) => theme);
}

/* ─────────────────────────────────────────────────────────
   Playwright: navega a Google Play Store, abre la sección
   de reseñas, ordena por "Más recientes" y extrae los datos
   directamente del DOM renderizado.
───────────────────────────────────────────────────────── */
async function scrapeApp(page: any, name: string, appId: string): Promise<AppData> {
  const color = APPS.find((a) => a.name === name)?.color ?? "#888";
  const url = `https://play.google.com/store/apps/details?id=${appId}&hl=es_CL&gl=CL`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  await page.waitForTimeout(2000);

  // Rating general
  const ratingText = await page
    .locator("div.TT9eCd")
    .first()
    .textContent()
    .catch(() => null);
  const rating = Number((ratingText ?? "0").replace(",", ".")) || 0;

  // Total de reseñas
  const reviewsLabel = await page
    .locator("div.g1rdde")
    .first()
    .textContent()
    .catch(() => "");
  const totalReviews = (reviewsLabel ?? "").trim() || "N/A";

  // Abrir vista completa de reseñas
  const openBtn = page
    .locator('button:has-text("Ver todas las reseñas"), button:has-text("See all reviews")')
    .first();
  if (await openBtn.count()) {
    await openBtn.click();
    await page.waitForTimeout(1500);
  }

  // Ordenar por más recientes
  const sortDropdown = page
    .locator('[role="button"]:has-text("Más relevantes"), [role="button"]:has-text("Most relevant")')
    .first();
  if (await sortDropdown.count()) {
    await sortDropdown.click();
    await page.waitForTimeout(600);
    const newestOption = page
      .locator('[role="option"]:has-text("Más recientes"), [role="option"]:has-text("Newest")')
      .first();
    if (await newestOption.count()) {
      await newestOption.click();
      await page.waitForTimeout(1500);
    }
  }

  // Scroll para cargar más reseñas
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(400);
  }

  // Extraer reseñas del DOM
  const rawReviews: { text: string; date: string; rating: number }[] =
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("div.RHo1pe"));
      return cards
        .slice(0, 8)
        .map((card) => {
          const textNode =
            card.querySelector("div.h3YV2d") ||
            card.querySelector("span[jsname='fbQN7e']");
          const text = (textNode?.textContent || "").trim();
          const date = (
            card.querySelector("span.bp9Aid")?.textContent || ""
          ).trim();
          const ratingLabel =
            card.querySelector("div.iXRFPc")?.getAttribute("aria-label") ||
            card
              .querySelector("span[aria-label*='estrellas']")
              ?.getAttribute("aria-label") ||
            "";
          const ratingMatch = ratingLabel.match(/(\d+)/);
          const rating = ratingMatch ? Number(ratingMatch[1]) : 3;
          return { text, date, rating };
        })
        .filter((r) => r.text.length > 20);
    });

  const recentReviews: Review[] = rawReviews.slice(0, 5).map((r) => ({
    text: r.text,
    date: r.date || "reciente 2025",
    rating: r.rating,
    sentiment: inferSentiment(r.rating),
  }));

  const avgRecent = recentReviews.length
    ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
    : rating;

  return {
    name,
    color,
    appId,
    rating,
    totalReviews,
    recentSentiment: inferSentiment(avgRecent),
    topIssues: computeThemes(recentReviews, ISSUE_KEYWORDS, 4),
    topPraises: computeThemes(recentReviews, PRAISE_KEYWORDS, 3),
    recentReviews,
  };
}

export async function POST() {
  const browser = await launchBrowser();
  const context = await browser.newContext({ locale: "es-CL" });
  const page = await context.newPage();

  try {
    const apps: AppData[] = [];

    for (const app of APPS) {
      try {
        apps.push(await scrapeApp(page, app.name, app.appId));
      } catch (err) {
        console.error(`App ${app.name} scrape failed:`, (err as Error).message);
        apps.push({
          name: app.name,
          color: app.color,
          appId: app.appId,
          rating: 0,
          totalReviews: "N/A",
          recentSentiment: "mixto",
          topIssues: [],
          topPraises: [],
          recentReviews: [],
        });
      }
    }

    const insight =
      "Los reclamos recientes apuntan a entrega y soporte; hay espacio para diferenciar con trazabilidad proactiva.";
    const opportunity =
      'Campaña "Seguimiento en tiempo real + soporte humano" enfocada en confianza post-compra.';

    return NextResponse.json({
      apps,
      insight,
      opportunity,
      scannedAt: new Date().toISOString(),
      source: "play.google.com",
    });
  } catch (error: any) {
    console.error("App reviews error:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener reviews" },
      { status: 500 }
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
