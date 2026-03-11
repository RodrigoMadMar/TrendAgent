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
   Playwright: intercepta XHR de Google Trends.
   - /multiline  → serie de tiempo + scores promedios
   - /relatedsearches → consultas en ascenso para Blue Express
     (primer término en q=, por lo que su respuesta llega PRIMERO)
───────────────────────────────────────────────────────── */
async function scrapeWithPlaywright() {
  const url =
    "https://trends.google.com/trends/explore?date=today%201-m&geo=CL&q=Blue%20Express,Chilexpress,Starken&hl=es";

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

  try {
    // Usamos arrays + Promise para evitar race-conditions en async
    const multilineBodies: string[] = [];
    const relatedBodies: string[] = [];
    const capturePromises: Promise<void>[] = [];

    page.on("response", (response) => {
      const rUrl = response.url();
      if (!rUrl.includes("trends.google.com/trends/api/widgetdata")) return;

      const p = response.text().then((text) => {
        if (text.length < 50) return;
        if (rUrl.includes("/multiline")) multilineBodies.push(text);
        if (rUrl.includes("/relatedsearches")) relatedBodies.push(text);
      }).catch(() => {});
      capturePromises.push(p);
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    // Esperar carga de widgets XHR (son lazy, necesitan ~5s)
    await page.waitForTimeout(5000);
    // Scroll para disparar widgets below-the-fold (related queries)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    // Esperar que todas las capturas async se resuelvan
    await Promise.allSettled(capturePromises);

    // ── Parsear multiline (timeline + scores) ────────────────
    let scores = [0, 0, 0];
    let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
    let timelinePoints: { date: string; values: number[] }[] = [];

    for (const body of multilineBodies) {
      try {
        const start = body.indexOf("{");
        if (start === -1) continue;
        const data = JSON.parse(body.slice(start));
        const timeline: any[] = data.default?.timelineData ?? [];
        if (!timeline.length) continue;

        // Timeline para gráfico (cada punto es una semana)
        timelinePoints = timeline.map((t: any) => ({
          date: t.formattedAxisTime ?? t.formattedTime ?? "",
          values: (t.value as number[]) ?? [0, 0, 0],
        }));

        // Score = promedio del período
        scores = BRANDS.map((_, i) =>
          Math.round(
            timeline.reduce((sum: number, t: any) => sum + (t.value?.[i] ?? 0), 0) /
              timeline.length
          )
        );

        // Tendencia: primera mitad vs segunda mitad
        if (timeline.length >= 6) {
          const mid = Math.floor(timeline.length / 2);
          const first = timeline.slice(0, mid);
          const second = timeline.slice(mid);
          trendDir = BRANDS.map((_, i) => {
            const a1 = first.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) / first.length;
            const a2 = second.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) / second.length;
            if (a2 > a1 * 1.08) return "up";
            if (a2 < a1 * 0.92) return "down";
            return "stable";
          });
        }
        break; // Solo necesitamos el primero
      } catch {}
    }

    // ── Parsear relatedsearches ───────────────────────────────
    // El PRIMER response de relatedsearches corresponde a Blue Express
    // (primer término en q=Blue%20Express,Chilexpress,Starken)
    let relatedQueries: { query: string; growth: string }[] = [];

    for (const body of relatedBodies) {
      try {
        const start = body.indexOf("{");
        if (start === -1) continue;
        const data = JSON.parse(body.slice(start));
        const rankedList: any[] = data.default?.rankedList ?? [];

        // rankedList[0] = "Top", rankedList[1] = "En ascenso"
        const rising = rankedList[1]?.rankedKeyword ?? rankedList[0]?.rankedKeyword ?? [];
        if (!rising.length) continue;

        relatedQueries = rising.slice(0, 6).map((k: any) => ({
          query: k.query ?? "",
          growth: k.formattedValue ?? (k.value ? `+${k.value}%` : "↑"),
        }));
        break; // Primer response = Blue Express
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

/* ─────────────────────────────────────────────────────────
   Fallback: Claude web_search
───────────────────────────────────────────────────────── */
async function claudeFallback() {
  const client = getClient();
  const response = await createWithRetry(
    () =>
      client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 700,
          tools: [{ type: "web_search_20250305", name: "web_search" } as any],
          system: "Responde SOLO con JSON. Sin markdown, sin texto extra.",
          messages: [{
            role: "user",
            content: `Busca en Google Trends la comparación de popularidad de búsqueda en Chile entre "Blue Express", "Chilexpress" y "Starken" durante los últimos 30 días. También busca las consultas relacionadas en ascenso para "Blue Express Chile".
Devuelve SOLO este JSON:
{"scores":[blue_0_100,chilex_0_100,starken_0_100],"trends":["up"|"down"|"stable","up"|"down"|"stable","up"|"down"|"stable"],"relatedQueries":[{"query":"texto consulta","growth":"+X%"}]}
Incluye al menos 4 consultas relacionadas reales en ascenso para Blue Express.`,
          }],
        },
        { headers: { "anthropic-beta": "web-search-2025-03-05" } }
      ),
    2
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text).join("");
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1) throw new Error("No JSON from Claude fallback");
  const d = JSON.parse(text.slice(s, e + 1));
  return {
    scores: (d.scores ?? [50, 80, 40]) as number[],
    trendDir: (d.trends ?? ["stable", "stable", "stable"]) as ("up" | "down" | "stable")[],
    relatedQueries: (d.relatedQueries ?? []) as { query: string; growth: string }[],
    timelinePoints: [] as { date: string; values: number[] }[],
  };
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
      messages: [{
        role: "user",
        content: `Datos Google Trends Chile 30 días (interés relativo 0-100):
${brands.map((b) => `${b.name}: ${b.score}/100, tendencia ${b.trend}`).join("\n")}
Consultas en ascenso Blue Express: ${relatedQueries.map((q) => `"${q.query}" ${q.growth}`).join(", ") || "sin datos"}
Escribe UNA frase de insight para el equipo de marketing de Blue Express (máx 120 chars). Sin comillas.`,
      }],
    })
  );
  return (response.content[0] as Anthropic.TextBlock).text.trim();
}

export async function POST() {
  let scores = [50, 80, 40];
  let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
  let relatedQueries: { query: string; growth: string }[] = [];
  let timelinePoints: { date: string; values: number[] }[] = [];
  let source = "Claude web_search";

  try {
    const pw = await scrapeWithPlaywright();
    if (pw.ok) {
      scores = pw.scores;
      trendDir = pw.trendDir;
      relatedQueries = pw.relatedQueries;
      timelinePoints = pw.timelinePoints;
      source = "trends.google.com";
    } else {
      throw new Error("Playwright sin datos");
    }
  } catch (err) {
    console.log("Brand pulse Playwright failed:", (err as Error).message);
    try {
      const fb = await claudeFallback();
      scores = fb.scores;
      trendDir = fb.trendDir;
      relatedQueries = fb.relatedQueries;
      timelinePoints = fb.timelinePoints;
    } catch (e2) {
      console.error("Claude fallback also failed:", e2);
    }
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
