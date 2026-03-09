import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
];

/**
 * Launches a headless Chromium browser in the right environment:
 *
 * 1. CHROMIUM_EXECUTABLE_PATH env var → uses that binary (any custom env)
 * 2. VERCEL / AWS Lambda           → downloads via @sparticuz/chromium-min
 * 3. Local / sandbox               → playwright auto-detects installed binary
 *                                    (run `npm run setup` once after npm install)
 */
export async function launchBrowser(): Promise<Browser> {
  // ── Override: custom executable path (e.g. your own Chromium) ──────────
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    return chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      headless: true,
      args: LAUNCH_ARGS,
    });
  }

  // ── Vercel / Lambda: sparticuz chromium downloaded at runtime ──────────
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: chromiumMin } = await import("@sparticuz/chromium-min");
    // CHROMIUM_URL lets you point to your own hosted tarball for faster cold starts.
    // Default: official Sparticuz release on GitHub.
    const chromiumUrl =
      process.env.CHROMIUM_URL ||
      "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";
    const executablePath = await chromiumMin.executablePath(chromiumUrl);
    return chromium.launch({
      executablePath,
      args: [...LAUNCH_ARGS, ...chromiumMin.args],
      headless: true,
    });
  }

  // ── Local / sandbox: playwright finds its own installed binary ──────────
  return chromium.launch({ headless: true, args: LAUNCH_ARGS });
}
