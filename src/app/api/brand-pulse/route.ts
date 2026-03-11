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

function parseGT(text: string): any {
  const idx = text.indexOf("{");
  if (idx === -1) throw new Error("No JSON in response");
  return JSON.parse(text.slice(idx));
}

/* ─────────────────────────────────────────────────────────
   Playwright con page.route() — intercepta los XHR de
   Google Trends ANTES de que el browser los procese,
   garantizando la lectura del body sin race conditions.

   Almacena también el parámetro req de la URL para poder
   identificar cuál respuesta corresponde a Blue Express.
───────────────────────────────────────────────────────── */
async function scrapeWithPlaywright() {
  const url =
    "https://trends.google.com/trends/explore?date=today%201-m&geo=CL&q=Blue%20Express,Chilexpress,Starken&hl=es";

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

  try {
    const multilineBodies: { body: string; reqParam: string }[] = [];
    const relatedBodies: { body: string; reqParam: string }[] = [];

    // page.route() es más fiable que page.on('response') porque
    // intercepta ANTES de que el browser procese la respuesta —
    // sin race conditions al leer el body.
    await page.route("**/trends/api/widgetdata/**", async (route) => {
      try {
        const response = await route.fetch();
        const text = await response.text();
        const rUrl = route.request().url();
        const reqParam = new URL(rUrl).searchParams.get("req") ?? "";

        if (rUrl.includes("/multiline")) {
          multilineBodies.push({ body: text, reqParam });
        } else if (rUrl.includes("/relatedsearches")) {
          relatedBodies.push({ body: text, reqParam });
        }

        await route.fulfill({ response });
      } catch {
        await route.continue();
      }
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 42000 });

    // Scroll para activar widgets de consultas relacionadas (lazy-loaded)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000);

    console.log(
      `GT route intercept: multiline=${multilineBodies.length}, related=${relatedBodies.length}`
    );

    // ── Parse timeline ─────────────────────────────────────
    let scores = [0, 0, 0];
    let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
    let timelinePoints: { date: string; values: number[] }[] = [];

    // Preferir la respuesta que contiene los 3 términos comparados
    const targetMultiline =
      multilineBodies.find(
        ({ reqParam }) =>
          reqParam.includes("Blue Express") &&
          reqParam.includes("Chilexpress") &&
          reqParam.includes("Starken")
      ) ?? multilineBodies[0];

    if (targetMultiline) {
      try {
        const data = parseGT(targetMultiline.body);
        const timeline: any[] = data.default?.timelineData ?? [];

        if (timeline.length) {
          timelinePoints = timeline.map((t: any) => ({
            date: t.formattedAxisTime ?? t.formattedTime ?? "",
            values: (t.value as number[]) ?? [0, 0, 0],
          }));

          scores = BRANDS.map((_, i) =>
            Math.round(
              timeline.reduce(
                (sum: number, t: any) => sum + (t.value?.[i] ?? 0),
                0
              ) / timeline.length
            )
          );

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
      } catch {}
    }

    // ── Parse related queries ──────────────────────────────
    // Identificar la respuesta de Blue Express por el parámetro req
    let relatedQueries: { query: string; growth: string }[] = [];

    const targetRelated =
      relatedBodies.find(({ reqParam }) =>
        reqParam.toLowerCase().includes("blue express")
      ) ?? relatedBodies[0];

    if (targetRelated) {
      try {
        const data = parseGT(targetRelated.body);
        const rankedList: any[] = data.default?.rankedList ?? [];
        // [0]=Top, [1]=En ascenso
        const rising =
          rankedList[1]?.rankedKeyword ??
          rankedList[0]?.rankedKeyword ??
          [];
        relatedQueries = rising.slice(0, 6).map((k: any) => ({
          query: k.query ?? "",
          growth: k.formattedValue ?? (k.value != null ? `+${k.value}%` : "↑"),
        }));
      } catch {}
    }

    return {
      scores,
      trendDir,
      relatedQueries,
      timelinePoints,
      ok: multilineBodies.length > 0 && scores.some((s) => s > 0),
    };
  } finally {
    await browser.close();
  }
}

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
          content: `Datos Google Trends Chile 30 días (interés relativo 0-100):
${brands.map((b) => `${b.name}: ${b.score}/100, tendencia ${b.trend}`).join("\n")}
Consultas en ascenso Blue Express: ${
            relatedQueries
              .map((q) => `"${q.query}" ${q.growth}`)
              .join(", ") || "sin datos"
          }
Escribe UNA frase de insight para el equipo de marketing de Blue Express (máx 120 chars). Sin comillas.`,
        },
      ],
    })
  );
  return (response.content[0] as Anthropic.TextBlock).text.trim();
}

export async function POST() {
  let scores = [0, 0, 0];
  let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
  let relatedQueries: { query: string; growth: string }[] = [];
  let timelinePoints: { date: string; values: number[] }[] = [];
  const source = "trends.google.com";

  try {
    const pw = await scrapeWithPlaywright();
    if (!pw.ok) throw new Error("Playwright no capturó datos de Google Trends");
    scores = pw.scores;
    trendDir = pw.trendDir;
    relatedQueries = pw.relatedQueries;
    timelinePoints = pw.timelinePoints;
  } catch (err) {
    const msg = (err as Error).message;
    console.error("Brand pulse failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const brands = BRANDS.map((b, i) => ({
    ...b,
    score: scores[i] ?? 0,
    trend: trendDir[i] ?? "stable",
  }));

  const insight = await generateInsight(brands, relatedQueries).catch(() => "");

  return NextResponse.json({
    brands,
    relatedQueries,
    timelinePoints,
    insight,
    source,
    scannedAt: new Date().toISOString(),
  });
}
