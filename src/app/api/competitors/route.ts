import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { BRAND } from "@/lib/constants";
import { launchBrowser } from "@/lib/browser";

export const maxDuration = 120;

// Instagram and X profiles for the two main competitors
const PROFILES = [
  { competitor: "Chilexpress", platform: "Instagram", url: "https://www.instagram.com/chilexpress/" },
  { competitor: "Chilexpress", platform: "X", url: "https://x.com/Chilexpress" },
  { competitor: "Starken", platform: "Instagram", url: "https://www.instagram.com/starkencl/" },
  { competitor: "Starken", platform: "X", url: "https://x.com/StarkenCL" },
];

export async function POST() {
  let browser;
  try {
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      locale: "es-CL",
      extraHTTPHeaders: { "Accept-Language": "es-CL,es;q=0.9" },
    });

    const screenshots: Array<{ competitor: string; platform: string; screenshotB64: string }> = [];

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

        // Dismiss login modal (Instagram / X)
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

    // Build vision prompt with all screenshots
    const client = getClient();
    const today = new Date().toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const content: any[] = [];
    for (const s of screenshots) {
      content.push({ type: "text", text: `\n=== ${s.competitor} en ${s.platform} ===` });
      if (s.screenshotB64) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: s.screenshotB64 },
        });
      } else {
        content.push({ type: "text", text: "(No se pudo cargar — requiere login o error de red)" });
      }
    }

    content.push({
      type: "text",
      text: `Hoy es ${today}. Analiza estas capturas de RRSS (Instagram y X) de los principales competidores logísticos chilenos de Blue Express.

Por cada captura identifica:
- Posts recientes y su temática / campaña
- Promociones, descuentos o códigos activos visibles
- Tono de comunicación
- Engagement aparente (likes, comentarios, RT visibles)

Genera EXACTAMENTE este JSON sin markdown ni texto adicional:
{
  "competitors": [
    {
      "name": "Chilexpress",
      "activityLevel": "alto" | "medio" | "bajo",
      "mainFocus": "qué están empujando actualmente (1 línea)",
      "promos": ["lista de promos/descuentos visibles en las imágenes"],
      "toneShift": "cambio de tono notable respecto a lo habitual, o null",
      "posts": [
        {
          "competitor": "Chilexpress",
          "platform": "Instagram" | "X",
          "type": "promo" | "campaña" | "orgánico" | "branding",
          "summary": "descripción del contenido del post (1-2 frases)",
          "copy": "texto visible del post o null",
          "engagement": "alto" | "medio" | "bajo",
          "date": "fecha visible en pantalla o 'reciente'",
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
  "summary": "resumen ejecutivo 2-3 líneas del panorama competitivo actual en RRSS"
}

Contexto Blue Express: pilares ${BRAND.pillars.join(", ")}, tono ${BRAND.tone}, audiencia ${BRAND.audience.join(", ")}.
Si un perfil no cargó o requiere login, indícalo en mainFocus y usa activityLevel "bajo" con posts vacío.
Máximo 4 oportunidades ordenadas por urgencia. SOLO JSON.`,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("");

    let analysis: any = { competitors: [], opportunities: [], summary: "" };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
    } catch (e) {
      console.error("Competitors parse error:", e, "\nRaw:", raw.slice(0, 400));
    }

    return NextResponse.json({
      ...analysis,
      screenshots: screenshots
        .filter((s) => s.screenshotB64)
        .map(({ competitor, platform, screenshotB64 }) => ({ competitor, platform, screenshotB64 })),
    });
  } catch (error: any) {
    console.error("Competitors route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scan competitors" },
      { status: 500 }
    );
  } finally {
    if (browser) await browser.close();
  }
}
