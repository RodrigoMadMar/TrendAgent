import { launchBrowser } from "@/lib/browser";

export type Sentiment = "positivo" | "mixto" | "negativo";
export type Review = { text: string; rating: number; date: string; sentiment: Sentiment };
export type AppData = {
  name: string;
  appId: string;
  url: string;
  rating: number;
  totalReviews: string;
  recentSentiment: Sentiment;
  topIssues: string[];
  topPraises: string[];
  recentReviews: Review[];
};

const APPS = [
  { name: "Chilexpress", appId: "cl.chilexpress.chilexpress" },
  { name: "Starken", appId: "cl.starken.movil" },
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
  "entregas rápidas": ["rápido", "puntual", "a tiempo"],
  "buena cobertura": ["cobertura", "sucursal", "todo chile", "nacional"],
};

const normalize = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function inferSentimentFromRating(rating: number): Sentiment {
  if (rating >= 4) return "positivo";
  if (rating <= 2) return "negativo";
  return "mixto";
}

function computeThemes(reviews: Review[], dict: Record<string, string[]>, max = 4) {
  const score = new Map<string, number>();
  const texts = reviews.map((r) => normalize(r.text));
  for (const [theme, words] of Object.entries(dict)) {
    let hits = 0;
    for (const text of texts) {
      if (words.some((w) => text.includes(normalize(w)))) hits += 1;
    }
    if (hits > 0) score.set(theme, hits);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([theme]) => theme);
}

async function scrapeApp(page: any, name: string, appId: string): Promise<AppData> {
  const url = `https://play.google.com/store/apps/details?id=${appId}&hl=es_CL&gl=CL`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const aggregate = await page.evaluate(() => {
    const fromMeta = {
      rating: Number((document.querySelector('meta[itemprop="ratingValue"]') as HTMLMetaElement | null)?.content ?? "0"),
      count: (document.querySelector('meta[itemprop="ratingCount"]') as HTMLMetaElement | null)?.content ?? "",
    };
    const ldJsonTexts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((n) => n.textContent ?? "").filter(Boolean);
    let rating = fromMeta.rating;
    let count = fromMeta.count;
    for (const raw of ldJsonTexts) {
      try {
        const data = JSON.parse(raw);
        if (data?.aggregateRating) {
          rating = Number(data.aggregateRating.ratingValue ?? rating);
          count = String(data.aggregateRating.ratingCount ?? count);
          break;
        }
      } catch {}
    }
    const countFormatted = count ? Intl.NumberFormat("es-CL").format(Number(String(count).replace(/[^\d]/g, ""))) : "N/A";
    return {
      rating: Number.isFinite(rating) ? rating : 0,
      totalReviews: count && count !== "0" ? `${countFormatted} opiniones` : "N/A",
    };
  });

  await page.goto(`${url}&showAllReviews=true`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const sortDropdown = page.locator('[role="button"]:has-text("Más relevantes"), [role="button"]:has-text("Most relevant")').first();
  if (await sortDropdown.count()) {
    await sortDropdown.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    const newest = page.locator('[role="option"]:has-text("Más recientes"), [role="option"]:has-text("Newest")').first();
    if (await newest.count()) {
      await newest.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(450);
  }

  const rawReviews = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("div.RHo1pe, div[data-review-id], article"));
    return candidates
      .map((card) => {
        const textNode = card.querySelector("div.h3YV2d") || card.querySelector("span[jsname='bN97Pc']") || card.querySelector("div[data-expanded-section]") || card.querySelector("span[jsname='fbQN7e']");
        const text = (textNode?.textContent || "").trim();
        const date = (card.querySelector("span.bp9Aid")?.textContent || card.querySelector("header span")?.textContent || "").trim();
        const ratingLabel =
          card.querySelector("div.iXRFPc")?.getAttribute("aria-label") ||
          card.querySelector("span[aria-label*='estrellas']")?.getAttribute("aria-label") ||
          card.querySelector("span[aria-label*='stars']")?.getAttribute("aria-label") ||
          "";
        const m = ratingLabel.match(/(\d+)/);
        const rating = m ? Number(m[1]) : 0;
        return { text, date, rating };
      })
      .filter((r) => r.text.length > 20)
      .slice(0, 8);
  });

  const recentReviews: Review[] = rawReviews.slice(0, 5).map((r: any) => ({
    text: r.text,
    date: r.date || "reciente",
    rating: r.rating > 0 ? r.rating : 3,
    sentiment: inferSentimentFromRating(r.rating > 0 ? r.rating : 3),
  }));

  const avgRecent = recentReviews.length
    ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
    : aggregate.rating;

  return {
    name,
    appId,
    url,
    rating: aggregate.rating,
    totalReviews: aggregate.totalReviews,
    recentSentiment: inferSentimentFromRating(avgRecent),
    topIssues: computeThemes(recentReviews, ISSUE_KEYWORDS, 4),
    topPraises: computeThemes(recentReviews, PRAISE_KEYWORDS, 3),
    recentReviews,
  };
}

export async function scrapeReviewsWithPlaywright() {
  const browser = await launchBrowser();
  const context = await browser.newContext({ locale: "es-CL" });
  const page = await context.newPage();

  try {
    const apps: AppData[] = [];
    for (const app of APPS) apps.push(await scrapeApp(page, app.name, app.appId));

    const insight = "Los reclamos recientes se concentran en entrega y soporte; oportunidad de diferenciar con trazabilidad confiable.";
    const opportunity = "Campaña: seguimiento proactivo + soporte humano en vivo para reducir incertidumbre post-compra.";

    return { apps, insight, opportunity, source: "play.google.com" };
  } finally {
    await context.close();
    await browser.close();
  }
}
