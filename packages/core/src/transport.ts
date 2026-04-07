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
    batchSize: Math.max(1, Math.floor(batchSize)),
    flushIntervalMs: Math.max(0, Math.floor(flushIntervalMs)),
  };
}

export class WebResearchEventQueue {
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

        while (true) {
          await this.flush(reason);

          if (this.events.length === 0) {
            break;
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
  const messageType = options.messageType ?? "insightfull:web-research-batch";

  return {
    send(batch) {
      options.targetWindow.postMessage(
        {
          type: messageType,
          batch,
        },
        options.targetOrigin,
      );
    },
    complete(payload) {
      options.targetWindow.postMessage(
        {
          type: `${messageType}:complete`,
          payload,
        },
        options.targetOrigin,
      );
    },
  };
}
