import { NextResponse } from "next/server";
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
  if (idx === -1) throw new Error("No JSON in GT response");
  return JSON.parse(text.slice(idx));
}

/* ─────────────────────────────────────────────────────────
   Google Trends API - flujo sin browser:
   1. GET trends/explore  → tokens por widget
   2. GET widgetdata/multiline  → serie de tiempo 30 días
   3. GET widgetdata/relatedsearches  → consultas en ascenso

   Este es el mismo protocolo que usa pytrends (Python).
   No necesita Playwright — los endpoints son públicos una
   vez que tenemos la cookie NID de la página principal.
───────────────────────────────────────────────────────── */
async function fetchGoogleTrends() {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  // Paso 0: visitar la página principal para obtener cookie NID
  const landingRes = await fetch(
    "https://trends.google.com/trends/explore?geo=CL&hl=es",
    {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9",
      },
      redirect: "follow",
    }
  );

  // Extraer cookies del header Set-Cookie
  const rawSetCookie = landingRes.headers.get("set-cookie") ?? "";
  const cookies = rawSetCookie
    .split(/,(?=[^;]+=)/)
    .map((c) => c.trim().split(";")[0])
    .join("; ");

  const apiHeaders: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-CL,es;q=0.9",
    "Referer": "https://trends.google.com/trends/explore",
    ...(cookies ? { Cookie: cookies } : {}),
  };

  // Paso 1: obtener tokens de widgets
  const exploreReq = {
    comparisonItem: [
      { keyword: "Blue Express", geo: "CL", time: "today 1-m" },
      { keyword: "Chilexpress", geo: "CL", time: "today 1-m" },
      { keyword: "Starken", geo: "CL", time: "today 1-m" },
    ],
    category: 0,
    property: "",
  };

  const exploreRes = await fetch(
    `https://trends.google.com/trends/api/explore?hl=es&tz=-180&req=${encodeURIComponent(
      JSON.stringify(exploreReq)
    )}`,
    { headers: apiHeaders }
  );

  if (!exploreRes.ok) {
    throw new Error(`Google Trends explore: HTTP ${exploreRes.status}`);
  }

  const widgets: any[] = parseGT(await exploreRes.text()).widgets ?? [];
  console.log("GT widgets found:", widgets.map((w: any) => w.id).join(", "));

  const tsWidget = widgets.find((w: any) => w.id === "TIMESERIES");
  const rqWidgets = widgets.filter((w: any) => w.id === "RELATED_QUERIES");

  if (!tsWidget) throw new Error("No TIMESERIES widget in explore response");

  // Paso 2: serie de tiempo
  const timelineRes = await fetch(
    `https://trends.google.com/trends/api/widgetdata/multiline?hl=es&tz=-180` +
      `&req=${encodeURIComponent(JSON.stringify(tsWidget.request))}` +
      `&token=${encodeURIComponent(tsWidget.token)}&geo=CL`,
    { headers: apiHeaders }
  );

  const timelineData: any[] =
    parseGT(await timelineRes.text()).default?.timelineData ?? [];

  // Paso 3: consultas relacionadas (Blue Express = índice 0 de RELATED_QUERIES)
  let relatedQueries: { query: string; growth: string }[] = [];
  if (rqWidgets.length > 0) {
    const rqRes = await fetch(
      `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=es&tz=-180` +
        `&req=${encodeURIComponent(JSON.stringify(rqWidgets[0].request))}` +
        `&token=${encodeURIComponent(rqWidgets[0].token)}&geo=CL`,
      { headers: apiHeaders }
    );
    const rqJson = parseGT(await rqRes.text());
    const rankedList: any[] = rqJson.default?.rankedList ?? [];
    const rising =
      rankedList[1]?.rankedKeyword ?? rankedList[0]?.rankedKeyword ?? [];
    relatedQueries = rising.slice(0, 6).map((k: any) => ({
      query: k.query ?? "",
      growth: k.formattedValue ?? (k.value != null ? `+${k.value}%` : "↑"),
    }));
  }

  // Calcular scores y tendencia
  let scores = [0, 0, 0];
  let trendDir: ("up" | "down" | "stable")[] = ["stable", "stable", "stable"];
  let timelinePoints: { date: string; values: number[] }[] = [];

  if (timelineData.length) {
    timelinePoints = timelineData.map((t: any) => ({
      date: t.formattedAxisTime ?? "",
      values: (t.value as number[]) ?? [0, 0, 0],
    }));
    scores = BRANDS.map((_, i) =>
      Math.round(
        timelineData.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) /
          timelineData.length
      )
    );
    if (timelineData.length >= 6) {
      const mid = Math.floor(timelineData.length / 2);
      const first = timelineData.slice(0, mid);
      const second = timelineData.slice(mid);
      trendDir = BRANDS.map((_, i) => {
        const a1 = first.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) / first.length;
        const a2 = second.reduce((s: number, t: any) => s + (t.value?.[i] ?? 0), 0) / second.length;
        if (a2 > a1 * 1.08) return "up";
        if (a2 < a1 * 0.92) return "down";
        return "stable";
      });
    }
  }

  return { scores, trendDir, relatedQueries, timelinePoints };
}

async function generateInsight(
  brands: { name: string; score: number; trend: string }[],
  relatedQueries: { query: string; growth: string }[]
): Promise<string> {
  const client = getClient();
  const res = await createWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `Google Trends Chile 30 días:
${brands.map((b) => `${b.name}: ${b.score}/100, tendencia ${b.trend}`).join("\n")}
Consultas en ascenso Blue Express: ${relatedQueries.map((q) => `"${q.query}" ${q.growth}`).join(", ") || "sin datos"}
Una frase de insight para el equipo de marketing de Blue Express (máx 120 chars). Sin comillas.`,
      }],
    })
  );
  return (res.content[0] as Anthropic.TextBlock).text.trim();
}

export async function POST() {
  try {
    const { scores, trendDir, relatedQueries, timelinePoints } =
      await fetchGoogleTrends();

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
      source: "trends.google.com",
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("Brand pulse error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
