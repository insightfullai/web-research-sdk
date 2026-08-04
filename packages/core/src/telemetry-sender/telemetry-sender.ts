/**
 * Sends batched telemetry events to the backend.
 */

import type { AttributeEvent, PageviewEvent, SdkEvent, TrackEvent } from "../types/index.js";

export interface TelemetryResult {
  ingested: number;
}

/** Map an SDK event to the backend's expected ingestion format. */
function mapEvent(
  event: SdkEvent,
  visitorId: string,
  userId: string | undefined,
  sdkVersion: string,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    eventType: event.type,
    visitorId,
    payload: event.payload,
    sdkVersion,
    url: event.url,
  };

  if (userId) {
    mapped.userId = userId;
  }

  if (event.type === "event") {
    mapped.eventName = (event as TrackEvent).name;
  } else if (event.type === "pageview") {
    mapped.eventName = (event as PageviewEvent).name;
  } else if (event.type === "attribute") {
    mapped.payload = {
      key: (event as AttributeEvent).key,
      value: (event as AttributeEvent).value,
    };
  }

  return mapped;
}

/**
 * POST a batch of events to the telemetry ingestion endpoint.
 * Retries once with exponential backoff on failure.
 */
export async function sendTelemetry(
  apiBase: string,
  clientId: string,
  visitorId: string,
  userId: string | null,
  batch: SdkEvent[],
  sdkVersion: string,
): Promise<TelemetryResult> {
  const MAX_ATTEMPTS = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${apiBase}/trpc/sdk.ingestSdkTelemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          events: batch.map((event) => mapEvent(event, visitorId, userId ?? undefined, sdkVersion)),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Telemetry ingestion failed: HTTP ${response.status}`);
      }

      const json: Record<string, unknown> = await response.json();
      const data = (json?.result as Record<string, unknown> | undefined)?.data ?? json;
      const ingested = (data as { ingested?: number })?.ingested ?? 0;
      return { ingested };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = 2 ** attempt * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
