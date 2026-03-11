import { NextResponse } from "next/server";
import { getClient, createWithRetry } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";
import { inferSentimentFromRating, scrapeReviewsWithPlaywright, type Sentiment } from "@/lib/app-reviews";

export const maxDuration = 60;

async function claudeFallback() {
  const client = getClient();
  const response = await createWithRetry(
    () =>
      client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1800,
          tools: [{ type: "web_search_20250305", name: "web_search" } as any],
          system: "Responde SOLO con JSON.",
          messages: [{
            role: "user",
            content: `Busca reseñas recientes y ratings de Chilexpress (cl.chilexpress.chilexpress) y Starken (cl.starken.movil) en Google Play Chile y responde JSON con apps[] (name,rating,totalReviews,recentSentiment,topIssues,topPraises,recentReviews[text,rating,date,sentiment]), insight y opportunity.`,
          }],
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
  if (s === -1 || e === -1) throw new Error("No JSON from Claude fallback");
  return { ...JSON.parse(text.slice(s, e + 1)), source: "claude-web-search-fallback" };
}

export async function POST() {
  try {
    let data: any;
    try {
      data = await scrapeReviewsWithPlaywright();
      const empty = !Array.isArray(data.apps) || data.apps.some((a: any) => a.rating <= 0 || a.recentReviews.length === 0);
      if (empty) throw new Error("Playwright devolvió datos incompletos");
    } catch (pwError) {
      console.error("Playwright app reviews failed:", pwError);
      data = await claudeFallback();
    }

    const apps = (data.apps ?? []).map((app: any) => ({
      name: app.name ?? "App",
      rating: Number(app.rating) || 0,
      totalReviews: app.totalReviews ?? "N/A",
      recentSentiment: (app.recentSentiment ?? "mixto") as Sentiment,
      topIssues: Array.isArray(app.topIssues) ? app.topIssues.slice(0, 4) : [],
      topPraises: Array.isArray(app.topPraises) ? app.topPraises.slice(0, 3) : [],
      recentReviews: Array.isArray(app.recentReviews)
        ? app.recentReviews.slice(0, 5).map((r: any) => ({
            text: String(r.text ?? ""),
            rating: Number(r.rating) || 3,
            date: String(r.date ?? ""),
            sentiment: (r.sentiment ?? inferSentimentFromRating(Number(r.rating) || 3)) as Sentiment,
          }))
        : [],
    }));

    return NextResponse.json({
      apps,
      insight: data.insight ?? "",
      opportunity: data.opportunity ?? "",
      source: data.source ?? "play.google.com",
      scannedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("App reviews error:", error);
    return NextResponse.json(
      { error: error.message || "Error al obtener reviews" },
      { status: 500 }
    );
  }
}
