import { launchBrowser } from "@/lib/browser";

const BRANDS = ["Blue Express", "Chilexpress", "Starken"];

type TrendDir = "up" | "down" | "stable";

export async function scrapeBrandPulseWithPlaywright() {
  const url =
    "https://trends.google.com/trends/explore?date=today%201-m&geo=CL&q=Blue%20Express,Chilexpress,Starken&hl=es";

  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-CL,es;q=0.9" });

  const parseReq = (rawReq: string) => {
    try {
      return JSON.parse(decodeURIComponent(rawReq));
    } catch {
      return null;
    }
  };

  try {
    const multilineBodies: { body: string; req: string }[] = [];
    const relatedBodies: { body: string; req: string }[] = [];
    const capturePromises: Promise<void>[] = [];

    page.on("response", (response) => {
      const rUrl = response.url();
      if (!rUrl.includes("trends.google.com/trends/api/widgetdata")) return;
      const reqParam = new URL(rUrl).searchParams.get("req") ?? "";

      const p = response
        .text()
        .then((text) => {
          if (text.length < 50) return;
          if (rUrl.includes("/multiline")) multilineBodies.push({ body: text, req: reqParam });
          if (rUrl.includes("/relatedsearches")) relatedBodies.push({ body: text, req: reqParam });
        })
        .catch(() => {});
      capturePromises.push(p);
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    await page.waitForTimeout(7000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    await Promise.allSettled(capturePromises);

    let scores = [0, 0, 0];
    let trendDir: TrendDir[] = ["stable", "stable", "stable"];
    let timelinePoints: { date: string; values: number[] }[] = [];

    const targetMultiline =
      multilineBodies.find(({ req }) => {
        const parsed = parseReq(req);
        const items = parsed?.comparisonItem?.map((c: any) => c.keyword) ?? [];
        return items.includes("Blue Express") && items.includes("Chilexpress") && items.includes("Starken");
      }) ?? multilineBodies[0];

    if (targetMultiline) {
      const parsedReq = parseReq(targetMultiline.req);
      const keywordOrder: string[] = parsedReq?.comparisonItem?.map((c: any) => c.keyword) ?? BRANDS;
      const idx = BRANDS.map((b) => keywordOrder.indexOf(b));

      const start = targetMultiline.body.indexOf("{");
      if (start !== -1) {
        const data = JSON.parse(targetMultiline.body.slice(start));
        const timeline: any[] = data.default?.timelineData ?? [];

        timelinePoints = timeline.map((t: any) => ({
          date: t.formattedAxisTime ?? t.formattedTime ?? "",
          values: idx.map((pos) => (pos >= 0 ? t.value?.[pos] ?? 0 : 0)),
        }));

        if (timeline.length) {
          scores = BRANDS.map((_, i) =>
            Math.round(
              timelinePoints.reduce((sum, t) => sum + (t.values?.[i] ?? 0), 0) /
                Math.max(1, timelinePoints.length)
            )
          );

          if (timelinePoints.length >= 6) {
            const mid = Math.floor(timelinePoints.length / 2);
            const first = timelinePoints.slice(0, mid);
            const second = timelinePoints.slice(mid);
            trendDir = BRANDS.map((_, i) => {
              const a1 = first.reduce((s, t) => s + (t.values?.[i] ?? 0), 0) / Math.max(1, first.length);
              const a2 = second.reduce((s, t) => s + (t.values?.[i] ?? 0), 0) / Math.max(1, second.length);
              if (a2 > a1 * 1.08) return "up";
              if (a2 < a1 * 0.92) return "down";
              return "stable";
            });
          }
        }
      }
    }

    let relatedQueries: { query: string; growth: string }[] = [];

    const targetRelated =
      relatedBodies.find(({ req }) => {
        const parsed = parseReq(req);
        const kw = parsed?.restriction?.complexKeywordsRestriction?.keyword?.[0]?.value;
        return kw === "Blue Express";
      }) ?? relatedBodies[0];

    if (targetRelated) {
      const start = targetRelated.body.indexOf("{");
      if (start !== -1) {
        const data = JSON.parse(targetRelated.body.slice(start));
        const rankedList: any[] = data.default?.rankedList ?? [];
        const rising = rankedList[1]?.rankedKeyword ?? rankedList[0]?.rankedKeyword ?? [];
        relatedQueries = rising.slice(0, 6).map((k: any) => ({
          query: k.query ?? "",
          growth: k.formattedValue ?? (k.value ? `+${k.value}%` : "↑"),
        }));
      }
    }

    return {
      scores,
      trendDir,
      relatedQueries,
      timelinePoints,
      ok: timelinePoints.length > 0 && scores.some((s) => s > 0),
    };
  } finally {
    await browser.close();
  }
}
