import type { SdkEvent, SessionMetadata } from "./protocol";

import { BrowserWebResearchSession } from "./browser";
import { OverlayBridgeRuntime } from "./bridge";
import { WebResearchEventQueue } from "./transport";
import type {
  BrowserSessionController,
  StartBrowserSessionOptions,
  WebResearchClient,
  WebResearchClientOptions,
  WebResearchTransport,
  WebResearchTransportCompletePayload,
} from "./types";

const DEFAULT_ENDPOINT = "https://api.insightfull.ai/web-research";

class DefaultWebResearchClient implements WebResearchClient {
  private readonly session: SessionMetadata;
  private readonly endpoint: string;
  private readonly configuredTransport: WebResearchClientOptions["transport"];
  private readonly batchingOptions: WebResearchClientOptions["batching"];
  public readonly bridge: OverlayBridgeRuntime;
  private readonly trackedEvents: SdkEvent[] = [];
  private queue: WebResearchEventQueue | undefined;
  private browserSession: BrowserSessionController | undefined;
  private readonly transportCompletionPromises = new WeakMap<WebResearchTransport, Promise<void>>();

  public constructor(private readonly options: WebResearchClientOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.configuredTransport = options.transport;
    this.batchingOptions = options.batching;
    this.session = {
      sessionId: options.sessionId ?? crypto.randomUUID(),
      startedAt: new Date().toISOString(),
    };
    this.bridge = new OverlayBridgeRuntime({
      sessionId: this.session.sessionId,
      bridgeInstanceId: crypto.randomUUID(),
      ...(options.bridge ? { bridge: options.bridge } : {}),
    });
  }

  public getSession(): SessionMetadata {
    return this.session;
  }

  public async track(event: SdkEvent): Promise<void> {
    this.trackedEvents.push(event);
    void this.endpoint;

    if (!this.configuredTransport) {
      return;
    }

    this.getOrCreateQueue(this.configuredTransport, this.batchingOptions).enqueue(event, "manual");
  }

  public async flush(reason?: string): Promise<void> {
    if (this.browserSession) {
      await this.browserSession.flush(reason);
    }

    await this.queue?.flush(reason);
  }

  public async complete(reason?: string): Promise<void> {
    const completionTasks: Promise<void>[] = [];
    if (this.browserSession) {
      completionTasks.push(this.browserSession.complete(reason));
    }
    if (this.queue) {
      completionTasks.push(this.queue.complete(reason));
    }

    if (completionTasks.length === 0) {
      return;
    }

    const completionResults = await Promise.allSettled(completionTasks);
    const firstFailure = completionResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (firstFailure) {
      throw firstFailure.reason;
    }
  }

  public startBrowserSession(options?: StartBrowserSessionOptions): BrowserSessionController {
    const transport = options?.transport ?? this.configuredTransport;
    if (!transport) {
      throw new Error("Browser session requires a configured transport");
    }

    if (!this.browserSession?.getSnapshot().active) {
      const batching = options?.batching ?? this.batchingOptions;
      const runtimeOptions = options;
      const sessionTransport = this.createSessionTransport(transport);
      this.browserSession = new BrowserWebResearchSession(
        batching
          ? runtimeOptions
            ? {
                session: this.session,
                transport: sessionTransport,
                batching,
                runtimeOptions,
              }
            : {
                session: this.session,
                transport: sessionTransport,
                batching,
              }
          : runtimeOptions
            ? {
                session: this.session,
                transport: sessionTransport,
                runtimeOptions,
              }
            : {
                session: this.session,
                transport: sessionTransport,
              },
      );
      this.browserSession.start();
    }

    return this.browserSession;
  }

  public getLifecycleState() {
    return this.bridge.getState();
  }

  public destroy(reason?: string): void {
    const pendingTeardown: Promise<void>[] = [];
    if (this.browserSession) {
      pendingTeardown.push(this.browserSession.destroy(reason));
    }
    if (this.queue) {
      pendingTeardown.push(this.queue.complete(reason));
    }

    this.bridge.terminate(reason);

    if (pendingTeardown.length > 0) {
      void Promise.allSettled(pendingTeardown);
    }
  }

  private getOrCreateQueue(
    transport: NonNullable<WebResearchClientOptions["transport"]>,
    batching: WebResearchClientOptions["batching"],
  ): WebResearchEventQueue {
    if (!this.queue) {
      const sessionTransport = this.createSessionTransport(transport);
      this.queue = batching
        ? new WebResearchEventQueue({
            session: this.session,
            transport: sessionTransport,
            batching,
          })
        : new WebResearchEventQueue({
            session: this.session,
            transport: sessionTransport,
          });
    }

    return this.queue;
  }

  private createSessionTransport(transport: WebResearchTransport): WebResearchTransport {
    if (!transport.complete) {
      return {
        send: (batch) => transport.send(batch),
      };
    }

    return {
      send: (batch) => transport.send(batch),
      complete: (payload) => this.completeTransportOnce(transport, payload),
    };
  }

  private completeTransportOnce(
    transport: WebResearchTransport,
    payload: WebResearchTransportCompletePayload,
  ): Promise<void> {
    if (!transport.complete) {
      return Promise.resolve();
    }

    const pendingCompletion = this.transportCompletionPromises.get(transport);
    if (pendingCompletion) {
      return pendingCompletion;
    }

    const completionPromise = Promise.resolve()
      .then(() => transport.complete!(payload))
      .catch((error) => {
        this.transportCompletionPromises.delete(transport);
        throw error;
      });

    this.transportCompletionPromises.set(transport, completionPromise);
    return completionPromise;
  }
}

export function createWebResearchClient(options: WebResearchClientOptions): WebResearchClient {
  if (!options.apiKey) {
    throw new Error("apiKey is required");
  }

  return new DefaultWebResearchClient(options);
}
