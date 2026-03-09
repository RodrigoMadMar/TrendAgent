import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

/** Wraps a Claude API call with exponential backoff retry on 429 rate limit errors. */
export async function createWithRetry(
  fn: () => Promise<Anthropic.Message>,
  maxRetries = 3
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.error?.type === "rate_limit_error";
      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // Throw a user-friendly message for rate limit errors
      if (isRateLimit) {
        throw new Error("Límite de uso de IA alcanzado. Espera 1 minuto y reintenta.");
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
