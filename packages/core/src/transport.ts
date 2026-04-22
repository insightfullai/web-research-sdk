import {
  WEB_RESEARCH_BATCH_MESSAGE_TYPE,
  WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_PROTOCOL_VERSION,
  type WebResearchBatchMessage,
  type WebResearchCompleteMessage,
} from "@insightfull/web-research-sdk-contracts";

import type {
  CallbackTransportOptions,
  PostMessageTransportOptions,
  SessionMetadata,
  SdkEvent,
  TrackedSdkEvent,
  WebResearchBatchingOptions,
  WebResearchTransport,
  WebResearchTransportCompletePayload,
} from "./types";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const MAX_BATCH_SIZE = 200;

interface QueueDependencies {
  now: () => number;
  generateId: () => string;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

function sanitizeBatchingOptions(options?: WebResearchBatchingOptions) {
  const rawBatchSize = options?.batchSize;
  const rawFlushIntervalMs = options?.flushIntervalMs;

  const batchSize =
    typeof rawBatchSize === "number" && Number.isFinite(rawBatchSize)
      ? rawBatchSize
      : DEFAULT_BATCH_SIZE;
  const flushIntervalMs =
    typeof rawFlushIntervalMs === "number" && Number.isFinite(rawFlushIntervalMs)
      ? rawFlushIntervalMs
      : DEFAULT_FLUSH_INTERVAL_MS;

  return {
    batchSize: Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(batchSize))),
    flushIntervalMs: Math.max(0, Math.floor(flushIntervalMs)),
  };
}

export class WebResearchEventQueue {
  private static readonly MAX_COMPLETE_FLUSH_RETRIES = 5;

  private readonly session: SessionMetadata;
  private readonly transport: WebResearchTransport;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly dependencies: QueueDependencies;

  private events: TrackedSdkEvent[] = [];
  private flushTimerId: ReturnType<typeof setTimeout> | undefined;
  private flushChain: Promise<void> = Promise.resolve();
  private completingPromise: Promise<void> | undefined;
  private lastFlushAt: string | undefined;
  private completed = false;

  public constructor(options: {
    session: SessionMetadata;
    transport: WebResearchTransport;
    batching?: WebResearchBatchingOptions;
    dependencies?: Partial<QueueDependencies>;
  }) {
    this.session = options.session;
    this.transport = options.transport;
    const batching = sanitizeBatchingOptions(options.batching);
    this.batchSize = batching.batchSize;
    this.flushIntervalMs = batching.flushIntervalMs;
    this.dependencies = {
      now: options.dependencies?.now ?? (() => Date.now()),
      generateId: options.dependencies?.generateId ?? (() => crypto.randomUUID()),
      setTimeout: options.dependencies?.setTimeout ?? globalThis.setTimeout.bind(globalThis),
      clearTimeout: options.dependencies?.clearTimeout ?? globalThis.clearTimeout.bind(globalThis),
    };
  }

  public enqueue(event: SdkEvent, source: TrackedSdkEvent["source"]): void {
    if (this.completed) {
      return;
    }

    this.events.push({
      ...event,
      id: this.dependencies.generateId(),
      sessionId: this.session.sessionId,
      source,
      capturedAt: new Date(this.dependencies.now()).toISOString(),
    });

    if (this.events.length >= this.batchSize) {
      void this.flush("batch_size").catch(() => undefined);
      return;
    }

    this.scheduleFlush();
  }

  public async flush(reason = "manual"): Promise<void> {
    if (this.events.length === 0) {
      return this.flushChain;
    }

    this.clearFlushTimer();
    const inFlightFlush = this.flushChain
      .catch(() => undefined)
      .then(async () => {
        if (this.events.length === 0) {
          return;
        }

        const batch = this.events.splice(0, this.events.length);
        try {
          await this.transport.send({
            session: this.session,
            events: batch,
            reason,
          });
          this.lastFlushAt = new Date(this.dependencies.now()).toISOString();
        } catch (error) {
          this.events = [...batch, ...this.events];
          this.scheduleFlush();
          throw error;
        }
      });
    this.flushChain = inFlightFlush.catch(() => undefined);

    return inFlightFlush;
  }

  public async complete(reason = "complete"): Promise<void> {
    if (this.completed) {
      return;
    }

    if (!this.completingPromise) {
      this.completingPromise = (async () => {
        this.clearFlushTimer();
        let consecutiveFailures = 0;

        while (this.events.length > 0) {
          try {
            await this.flush(reason);
            consecutiveFailures = 0;
          } catch {
            consecutiveFailures++;
            if (consecutiveFailures >= WebResearchEventQueue.MAX_COMPLETE_FLUSH_RETRIES) {
              throw new Error(
                `Failed to flush ${this.events.length} events after ` +
                  `${consecutiveFailures} attempts. Transport may be dead.`,
              );
            }
          }
        }

        if (this.transport.complete) {
          const payload: WebResearchTransportCompletePayload = {
            session: this.session,
            reason,
            sentAt: new Date(this.dependencies.now()).toISOString(),
          };
          await this.transport.complete(payload);
        }

        this.completed = true;
      })();
    }

    try {
      await this.completingPromise;
    } catch (error) {
      this.completingPromise = undefined;
      throw error;
    }
  }

  public getSnapshot() {
    return this.lastFlushAt
      ? {
          bufferedEvents: this.events.length,
          lastFlushAt: this.lastFlushAt,
        }
      : {
          bufferedEvents: this.events.length,
        };
  }

  private scheduleFlush(): void {
    if (this.flushIntervalMs === 0 || this.flushTimerId) {
      return;
    }

    this.flushTimerId = this.dependencies.setTimeout(() => {
      this.flushTimerId = undefined;
      void this.flush("interval").catch(() => undefined);
    }, this.flushIntervalMs);
  }

  private clearFlushTimer(): void {
    if (!this.flushTimerId) {
      return;
    }

    this.dependencies.clearTimeout(this.flushTimerId);
    this.flushTimerId = undefined;
  }
}

export function createCallbackTransport(options: CallbackTransportOptions): WebResearchTransport {
  const onComplete = options.onComplete;

  if (!onComplete) {
    return {
      send: (batch) => options.onBatch(batch),
    };
  }

  return {
    send: (batch) => options.onBatch(batch),
    complete: (payload) => onComplete(payload),
  };
}

export function createPostMessageTransport(
  options: PostMessageTransportOptions,
): WebResearchTransport {
  const batchMessageType = options.messageType ?? WEB_RESEARCH_BATCH_MESSAGE_TYPE;

  return {
    send(batch) {
      const payload: WebResearchBatchMessage = {
        type: batchMessageType,
        version: WEB_RESEARCH_PROTOCOL_VERSION,
        session: batch.session,
        sentAt: new Date().toISOString(),
        reason: batch.reason,
        events: batch.events as WebResearchBatchMessage["events"],
      };

      options.targetWindow.postMessage(payload, options.targetOrigin);
    },
    complete(payload) {
      const completeMessage: WebResearchCompleteMessage = {
        type: WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
        version: WEB_RESEARCH_PROTOCOL_VERSION,
        session: payload.session,
        sentAt: payload.sentAt,
        reason: payload.reason,
      };

      options.targetWindow.postMessage(completeMessage, options.targetOrigin);
    },
  };
}
