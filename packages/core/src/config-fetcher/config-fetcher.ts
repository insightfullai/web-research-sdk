import type { SdkConfig } from "../types/index.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

function getRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * exponentialDelay;
  return Math.min(jitter, MAX_DELAY_MS);
}

function buildConfigUrl(apiBase: string, clientId: string): string {
  const params = new URLSearchParams({
    input: JSON.stringify({ clientId }),
  });
  return `${apiBase}/trpc/sdk.getConfig?${params.toString()}`;
}

export async function fetchConfig(apiBase: string, clientId: string): Promise<SdkConfig | null> {
  const url = buildConfigUrl(apiBase, clientId);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();

      if (json?.error) {
        return null;
      }

      // tRPC can wrap the response as either plain JSON or SuperJSON.
      const data = json?.result?.data?.json ?? json?.result?.data ?? json;
      return data as SdkConfig;
    } catch {
      clearTimeout(timeout);
      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return null;
}

export { buildConfigUrl, getRetryDelay };
