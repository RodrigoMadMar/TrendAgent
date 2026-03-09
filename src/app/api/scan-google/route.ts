import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST() {
  try {
    // Google Trends RSS for Chile — last 24 hours
    const res = await fetch(
      "https://trends.google.com/trending/rss?geo=CL&hours=24",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        cache: "no-store",
      }
    );

    if (!res.ok)
      throw new Error(`Google Trends RSS respondió con ${res.status}`);
    const xml = await res.text();

    const trends = parseGoogleTrendsRSS(xml);
    if (!trends.length)
      throw new Error("No se pudieron extraer búsquedas de Google Trends CL");

    return NextResponse.json({
      trends,
      source: "Google Trends",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("scan-google error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function stripCDATA(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function parseGoogleTrendsRSS(xml: string) {
  const trends: any[] = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && trends.length < 20) {
    const item = m[1];

    const titleMatch = item.match(
      /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/
    );
    const trafficMatch = item.match(
      /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/
    );
    const snippetMatch = item.match(
      /<ht:news_item_snippet>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:news_item_snippet>/
    );
    const newsTitleMatch = item.match(
      /<ht:news_item_title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:news_item_title>/
    );

    if (!titleMatch) continue;

    const title = stripCDATA(titleMatch[1]);
    const traffic = trafficMatch ? trafficMatch[1].trim() : "N/A";
    const rawSummary = snippetMatch
      ? snippetMatch[1]
      : newsTitleMatch
        ? newsTitleMatch[1]
        : "";
    const summary = rawSummary
      ? stripTags(stripCDATA(rawSummary))
      : `Tendencia activa en búsquedas Google Chile — últimas 24 horas`;

    trends.push({
      title,
      source: "Google Trends",
      category: "Google Trends",
      summary: summary.substring(0, 300),
      volume: traffic,
    });
  }

  return trends;
}
