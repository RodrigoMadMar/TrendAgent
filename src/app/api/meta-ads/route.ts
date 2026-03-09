import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import { getClient } from "@/lib/anthropic";

export const maxDuration = 120;

const CHROMIUM_PATH =
  process.env.CHROMIUM_EXECUTABLE_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const META_ADS_URL = (q: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;

export async function POST() {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      locale: "es-CL",
      extraHTTPHeaders: { "Accept-Language": "es-CL,es;q=0.9" },
    });

    const client = getClient();
    const results: any[] = [];

    for (const { name, query } of [
      { name: "Chilexpress", query: "Chilexpress" },
      { name: "Starken", query: "Starken" },
    ]) {
      const page = await context.newPage();
      let screenshotB64: string | null = null;

      try {
        await page.goto(META_ADS_URL(query), {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });

        await page.waitForTimeout(5000);

        // Dismiss cookie/consent banners
        for (const text of ["Aceptar todo", "Aceptar", "Accept all", "Accept"]) {
          try {
            await page.click(`button:has-text("${text}")`, { timeout: 1500 });
            await page.waitForTimeout(800);
            break;
          } catch {}
        }

        // Close login modal if it appears
        for (const sel of ['[aria-label="Cerrar"]', '[aria-label="Close"]', "._98ez"]) {
          try {
            await page.click(sel, { timeout: 1500 });
            await page.waitForTimeout(400);
            break;
          } catch {}
        }
        try { await page.keyboard.press("Escape"); } catch {}

        await page.waitForTimeout(2000);

        const buf = await page.screenshot({ type: "jpeg", quality: 65 });
        screenshotB64 = buf.toString("base64");

        const domText: string = await page.evaluate(
          () => document.body.innerText.slice(0, 3000)
        );

        // Claude vision analyzes the screenshot
        const visionRes = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1200,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: screenshotB64,
                  },
                },
                {
                  type: "text",
                  text: `Esta es una captura de la Biblioteca de Anuncios de Meta buscando "${query}" en Chile.

Extrae los anuncios activos visibles. Por cada anuncio devuelve:
[
  {
    "advertiser": "nombre del anunciante",
    "copy": "texto del anuncio (máx 200 chars)",
    "cta": "call to action o null",
    "platform": "Facebook" | "Instagram" | "Facebook e Instagram",
    "creativeType": "imagen" | "video" | "carrusel" | "texto",
    "activeFrom": "fecha de inicio visible o null"
  }
]

Texto del DOM para contexto:
${domText.slice(0, 600)}

Si hay pantalla de login, sin resultados o error → devuelve [].
SOLO el JSON array, sin markdown.`,
                },
              ],
            },
          ],
        });

        const raw = visionRes.content
          .filter((b) => b.type === "text")
          .map((b) => (b as any).text)
          .join("");

        let ads: any[] = [];
        try {
          const match = raw.match(/\[[\s\S]*\]/);
          if (match) ads = JSON.parse(match[0]);
        } catch {}

        results.push({
          competitor: name,
          ads: ads.slice(0, 6).map((ad: any, i: number) => ({
            ...ad,
            id: `${name.toLowerCase()}-${i}`,
          })),
          screenshotB64,
          scannedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`meta-ads error for ${name}:`, err.message);
        results.push({
          competitor: name,
          ads: [],
          screenshotB64,
          error: err.message,
          scannedAt: new Date().toISOString(),
        });
      } finally {
        await page.close();
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("meta-ads launch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to launch browser" },
      { status: 500 }
    );
  } finally {
    if (browser) await browser.close();
  }
}
