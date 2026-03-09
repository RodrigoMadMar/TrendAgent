import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";
import { launchBrowser } from "@/lib/browser";

export const maxDuration = 120;

const PROFILES = [
  { competitor: "Chilexpress", platform: "Facebook", url: "https://www.facebook.com/Chilexpress" },
  { competitor: "Starken", platform: "Facebook", url: "https://www.facebook.com/StarkenCL" },
];

async function takeProfileScreenshots() {
  let browser;
  const screenshots: Array<{ competitor: string; platform: string; screenshotB64: string }> = [];
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      locale: "es-CL",
      extraHTTPHeaders: { "Accept-Language": "es-CL,es;q=0.9" },
    });

    for (const { competitor, platform, url } of PROFILES) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(3500);

        // Dismiss cookie banners
        for (const text of ["Aceptar todo", "Aceptar", "Accept all", "Accept"]) {
          try {
            await page.click(`button:has-text("${text}")`, { timeout: 1200 });
            await page.waitForTimeout(500);
            break;
          } catch {}
        }

        // Dismiss login modal
        for (const text of ["Ahora no", "Not Now", "Cerrar", "Close", "Dismiss"]) {
          try {
            await page.click(`button:has-text("${text}")`, { timeout: 1200 });
            await page.waitForTimeout(400);
            break;
          } catch {}
        }
        for (const sel of [
          '[aria-label="Close"]',
          '[aria-label="Cerrar"]',
          '[data-testid="app-bar-close"]',
          'div[role="dialog"] [role="button"]',
        ]) {
          try {
            await page.click(sel, { timeout: 1000 });
            await page.waitForTimeout(400);
            break;
          } catch {}
        }
        try { await page.keyboard.press("Escape"); } catch {}
        await page.waitForTimeout(800);

        const buf = await page.screenshot({ type: "jpeg", quality: 65 });
        screenshots.push({ competitor, platform, screenshotB64: buf.toString("base64") });
      } catch (err: any) {
        console.error(`Screenshot error ${competitor} ${platform}:`, err.message);
        screenshots.push({ competitor, platform, screenshotB64: "" });
      } finally {
        await page.close();
      }
    }
  } catch (err: any) {
    console.error("Browser launch error for screenshots:", err.message);
  } finally {
    if (browser) await browser.close();
  }
  return screenshots;
}

async function analyzeWithWebSearch(today: string) {
  const client = getClient();

  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        } as any,
      ],
      system: `Eres un analista de inteligencia competitiva para Blue Express, empresa de logística y envíos de Chile. Analiza la actividad reciente en redes sociales de los competidores directos. Responde SOLO con JSON válido, sin markdown ni texto adicional.`,
      messages: [
        {
          role: "user",
          content: `Hoy es ${today}. Analiza la actividad reciente en Facebook y redes sociales de los principales competidores logísticos chilenos de Blue Express.

Haz estas búsquedas:
1. "Chilexpress Facebook publicaciones recientes 2025" — busca sus últimas campañas y posts en Facebook
2. "Starken Facebook publicaciones recientes 2025" — busca sus últimas campañas en Facebook
3. "Chilexpress promociones descuentos Chile ${today}" — busca ofertas activas
4. "Starken promociones descuentos Chile ${today}" — busca ofertas activas
5. "Chilexpress anuncios Facebook Meta 2025" — busca anuncios activos
6. "Starken anuncios Facebook Meta 2025" — busca anuncios activos

Con lo que encuentres, genera EXACTAMENTE este JSON sin markdown ni texto adicional:
{
  "competitors": [
    {
      "name": "Chilexpress",
      "activityLevel": "alto" | "medio" | "bajo",
      "mainFocus": "qué están empujando actualmente (1 línea)",
      "promos": ["lista de promos/descuentos encontrados"],
      "toneShift": "cambio de tono notable respecto a lo habitual, o null",
      "posts": [
        {
          "competitor": "Chilexpress",
          "platform": "Facebook" | "Instagram" | "X",
          "type": "promo" | "campaña" | "orgánico" | "branding",
          "summary": "descripción del contenido del post (1-2 frases)",
          "copy": "texto del post encontrado o null",
          "engagement": "alto" | "medio" | "bajo",
          "date": "fecha del post o 'reciente'",
          "opportunity": "oportunidad específica para Blue Express o null"
        }
      ]
    },
    {
      "name": "Starken",
      "activityLevel": "...",
      "mainFocus": "...",
      "promos": [],
      "toneShift": null,
      "posts": []
    }
  ],
  "opportunities": [
    {
      "title": "nombre corto de la oportunidad reactiva",
      "trigger": "qué publicó el competidor que genera esta oportunidad",
      "suggestion": "qué puede hacer Blue Express concreto (2-3 líneas)",
      "urgency": "alta" | "media" | "baja",
      "channel": "Push + Email" | "Paid Social" | "Instagram + TikTok" | "Email" | "Push" | "Full funnel"
    }
  ],
  "summary": "resumen ejecutivo 2-3 líneas del panorama competitivo actual"
}

Contexto Blue Express: pilares ${BRAND.pillars.join(", ")}, tono ${BRAND.tone}, audiencia ${BRAND.audience.join(", ")}.
Máximo 4 oportunidades ordenadas por urgencia. SOLO JSON.`,
        },
      ],
    },
    { headers: { "anthropic-beta": "web-search-2025-03-05" } }
  );

  const texts = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let analysis: any = { competitors: [], opportunities: [], summary: "" };
  try {
    const clean = texts.replace(/```json?/g, "").replace(/```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) analysis = JSON.parse(match[0]);
  } catch (e) {
    console.error("Competitors parse error:", e, "\nRaw:", texts.slice(0, 400));
  }
  return analysis;
}

export async function POST() {
  try {
    const today = new Date().toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Run screenshots and web search analysis in parallel
    const [screenshots, analysis] = await Promise.all([
      takeProfileScreenshots(),
      analyzeWithWebSearch(today),
    ]);

    return NextResponse.json({
      ...analysis,
      screenshots: screenshots.filter((s) => s.screenshotB64),
    });
  } catch (error: any) {
    console.error("Competitors route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan competitors" },
      { status: 500 }
    );
  }
}
