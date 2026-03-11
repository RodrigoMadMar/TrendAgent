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
   Playwright: intercepta las llamadas XHR internas de Google
   Trends y extrae los datos de series de tiempo + consultas
   relacionadas en ascenso para Blue Express.
───────────────────────────────────────────────────────── */
async function scrapeWithPlaywright() {
  const url =
    "https://trends.google.com/trends/explore?date=today%201-m&geo=CL&q=Blue%20Express,Chilexpress,Starken&hl=es";

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

  try {
    const captured: { url: string; body: string }[] = [];

    page.on("response", async (response) => {
      const rUrl = response.url();
      if (rUrl.includes("trends.google.com/trends/api/widgetdata")) {
        try {
          const text = await response.text();
          captured.push({ url: rUrl, body: text });
        } catch {}
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    // Esperamos que los widgets carguen sus datos vía XHR
    await page.waitForTimeout(6000);

    let scores = [0, 0, 0];
    let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
    let relatedQueries: { query: string; growth: string }[] = [];

    for (const { url: rUrl, body } of captured) {
      try {
        const start = body.indexOf("{");
        if (start === -1) continue;
        const data = JSON.parse(body.slice(start));

        // Timeline data → scores y dirección de tendencia
        if (rUrl.includes("/multiline") && data.default?.timelineData) {
          const timeline: any[] = data.default.timelineData;
          if (!timeline.length) continue;

          // Score = promedio de todos los puntos del período
          scores = BRANDS.map((_, i) =>
            Math.round(
              timeline.reduce((sum, t) => sum + (t.value?.[i] ?? 0), 0) /
                timeline.length
            )
          );

          // Tendencia: primera mitad vs segunda mitad
          if (timeline.length >= 6) {
            const mid = Math.floor(timeline.length / 2);
            const first = timeline.slice(0, mid);
            const second = timeline.slice(mid);
            trendDir = BRANDS.map((_, i) => {
              const a1 =
                first.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) /
                first.length;
              const a2 =
                second.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) /
                second.length;
              if (a2 > a1 * 1.08) return "up";
              if (a2 < a1 * 0.92) return "down";
              return "stable";
            });
          }
        }

        // Consultas relacionadas en ascenso para Blue Express
        if (
          rUrl.includes("/relatedsearches") &&
          relatedQueries.length === 0
        ) {
          const decoded = decodeURIComponent(rUrl).toLowerCase();
          if (decoded.includes("blue") && decoded.includes("express")) {
            const rankedList: any[] = data.default?.rankedList ?? [];
            // índice 1 = "En ascenso"
            const rising =
              rankedList[1]?.rankedKeyword ??
              rankedList[0]?.rankedKeyword ??
              [];
            relatedQueries = rising.slice(0, 6).map((k: any) => ({
              query: k.query ?? "",
              growth: k.formattedValue ?? (k.value ? `+${k.value}%` : "↑"),
            }));
          }
        }
      } catch {}
    }

    return {
      scores,
      trendDir,
      relatedQueries,
      ok: captured.length > 0 && scores.some((s) => s > 0),
    };
  } finally {
    await browser.close();
  }
}

/* ─────────────────────────────────────────────────────────
   Fallback: Claude web_search busca interés de búsqueda
   comparativo para las tres marcas en Chile.
───────────────────────────────────────────────────────── */
async function claudeFallback() {
  const client = getClient();
  const response = await createWithRetry(
    () =>
      client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          tools: [
            { type: "web_search_20250305", name: "web_search" } as any,
          ],
          system:
            "Responde SOLO con JSON. Sin markdown, sin texto extra.",
          messages: [
            {
              role: "user",
              content: `Busca comparación de popularidad de búsqueda en Chile entre "Blue Express", "Chilexpress" y "Starken" en los últimos 30 días.
Devuelve SOLO este JSON:
{"scores":[blue_0_100,chilex_0_100,starken_0_100],"trends":["up"|"down"|"stable","up"|"down"|"stable","up"|"down"|"stable"],"relatedQueries":[{"query":"texto","growth":"+X%"}]}
Estima los valores relativos (0-100) según popularidad web.`,
            },
          ],
        },
        { headers: { "anthropic-beta": "web-search-2025-03-05" } }
      ),
    2
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON from Claude fallback");
  const d = JSON.parse(text.slice(s, e + 1));
  return {
    scores: d.scores ?? [50, 80, 40],
    trendDir: (d.trends ?? ["stable", "stable", "stable"]) as (
      | "up"
      | "down"
      | "stable"
    )[],
    relatedQueries: (d.relatedQueries ?? []) as {
      query: string;
      growth: string;
    }[],
  };
}

/* ─────────────────────────────────────────────────────────
   Claude genera insight de una línea sobre el pulso de marca
───────────────────────────────────────────────────────── */
async function generateInsight(
  brands: { name: string; score: number; trend: string }[],
  relatedQueries: { query: string; growth: string }[]
): Promise<string> {
  const client = getClient();
  const response = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Datos de Google Trends Chile (30 días):
${brands.map((b) => `${b.name}: ${b.score}/100, tendencia ${b.trend}`).join("\n")}
Consultas en ascenso de Blue Express: ${relatedQueries.map((q) => `"${q.query}" ${q.growth}`).join(", ") || "sin datos"}

Escribe UNA sola frase de insight para el equipo de marketing de Blue Express (máx 120 caracteres). Sin comillas.`,
        },
      ],
    })
  );
  return (response.content[0] as Anthropic.TextBlock).text.trim();
}

/* ─────────────────────────────────────────────────────────
   Handler
───────────────────────────────────────────────────────── */
export async function POST() {
  let scores = [50, 80, 40];
  let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
  let relatedQueries: { query: string; growth: string }[] = [];
  let source = "Claude web_search";

  try {
    const pw = await scrapeWithPlaywright();
    if (pw.ok) {
      scores = pw.scores;
      trendDir = pw.trendDir;
      relatedQueries = pw.relatedQueries;
      source = "trends.google.com";
    } else {
      console.log("Playwright got no data, falling back to Claude");
      throw new Error("No data");
    }
  } catch (err) {
    console.log("Brand pulse Playwright failed:", (err as Error).message);
    try {
      const fb = await claudeFallback();
      scores = fb.scores;
      trendDir = fb.trendDir;
      relatedQueries = fb.relatedQueries;
    } catch (e2) {
      console.error("Claude fallback also failed:", e2);
    }
  }

  const brands = BRANDS.map((b, i) => ({
    ...b,
    score: scores[i] ?? 0,
    trend: trendDir[i] ?? "stable",
  }));

  const insight = await generateInsight(brands, relatedQueries).catch(
    () => "Sin insight disponible."
  );

  return NextResponse.json({
    brands,
    relatedQueries,
    insight,
    source,
    scannedAt: new Date().toISOString(),
  });
}
