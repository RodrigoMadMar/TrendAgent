import { NextResponse } from "next/server";
import { chromium } from "playwright-core";
import { getClient } from "@/lib/anthropic";

export const maxDuration = 120;

// Local dev: uses cached Playwright Chromium
// Vercel: set CHROMIUM_EXECUTABLE_PATH to @sparticuz/chromium path
const CHROMIUM_PATH =
  process.env.CHROMIUM_EXECUTABLE_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const META_ADS_URL = (q: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;

export async function POST() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--single-process",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      locale: "es-CL",
      extraHTTPHeaders: {
        "Accept-Language": "es-CL,es;q=0.9,en-US;q=0.8",
      },
    });

    const results: any[] = [];
    const client = getClient();

    const targets = [
      { name: "Chilexpress", query: "Chilexpress" },
      { name: "Starken", query: "Starken" },
    ];

    for (const { name, query } of targets) {
      const page = await context.newPage();
      let screenshotB64: string | null = null;

      try {
        await page.goto(META_ADS_URL(query), {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });

        // Wait for React hydration and ad rendering
        await page.waitForTimeout(5000);

        // Dismiss cookie banner (Spanish + English variants)
        for (const text of ["Aceptar todo", "Aceptar", "Accept all", "Accept"]) {
          try {
            await page.click(`button:has-text("${text}")`, { timeout: 1500 });
            await page.waitForTimeout(800);
            break;
          } catch {}
        }

        // Close any login modal
        for (const sel of [
          '[aria-label="Cerrar"]',
          '[aria-label="Close"]',
          "._98ez",
        ]) {
          try {
            await page.click(sel, { timeout: 1500 });
            await page.waitForTimeout(400);
            break;
          } catch {}
        }
        try {
          await page.keyboard.press("Escape");
        } catch {}

        // Let ads settle
        await page.waitForTimeout(2000);

        // Viewport screenshot (JPEG, quality 65 keeps size manageable)
        const buf = await page.screenshot({ type: "jpeg", quality: 65 });
        screenshotB64 = buf.toString("base64");

        // Raw DOM text for context
        const domText: string = await page.evaluate(
          () => document.body.innerText.slice(0, 3000)
        );

        // Claude vision: analyze screenshot and extract ad data
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
                  text: `Esta es una captura de la Biblioteca de Anuncios de Meta (Facebook Ads Library) buscando "${query}" en Chile.

Extrae los anuncios activos que puedas ver. Para cada anuncio devuelve un JSON array:
[
  {
    "advertiser": "nombre del anunciante",
    "copy": "texto principal del anuncio (máx 200 chars)",
    "cta": "call to action visible o null",
    "platform": "Facebook" | "Instagram" | "Facebook e Instagram",
    "creativeType": "imagen" | "video" | "carrusel" | "texto",
    "activeFrom": "fecha de inicio si visible, ej: '15 de enero de 2025', o null"
  }
]

Contexto adicional del DOM (puede ayudar a leer texto):
${domText.slice(0, 800)}

Si la página muestra login requerido, sin resultados, o error — devuelve [].
SOLO responde con el JSON array, sin markdown.`,
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
  } finally {
    await browser.close();
  }
}
