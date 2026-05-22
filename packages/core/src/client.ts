import { isRecord } from "@insightfull/web-research-sdk-contracts";

import {
  RUNTIME_ENVIRONMENTS,
  type RuntimeEnvironment,
  type SdkEvent,
  type SessionMetadata,
} from "./protocol";

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

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateEndpoint(endpoint: string, environment: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`Invalid endpoint URL: ${endpoint}`);
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new Error(
      `Endpoint must use HTTPS (or http://localhost for development): ${endpoint}`,
    );
  }

  if (environment === "prod") {
    const isRfc1918 =
      /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname);
    const isLinkLocal = /^169\.254\./.test(parsed.hostname);
    const isLoopbackNonLocal =
      /^127\./.test(parsed.hostname) && parsed.hostname !== "127.0.0.1";

    if (isRfc1918 || isLinkLocal || isLoopbackNonLocal) {
      throw new Error(
        `Endpoint resolves to a private/local address which is not allowed in production: ${endpoint}`,
      );
    }
  }

  return endpoint;
}

function isRuntimeEnvironment(value: unknown): value is RuntimeEnvironment {
  return typeof value === "string" && RUNTIME_ENVIRONMENTS.includes(value as RuntimeEnvironment);
}

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
    if (options.sessionId !== undefined) {
      if (!UUID_V4_REGEX.test(options.sessionId)) {
        throw new Error("sessionId must be a valid UUID v4 format");
      }
    }
    this.endpoint = options.endpoint
      ? validateEndpoint(options.endpoint, options.environment)
      : DEFAULT_ENDPOINT;
    this.configuredTransport = options.transport;
    this.batchingOptions = options.batching;
    this.session = {
      sessionId: options.sessionId ?? crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      environment: options.environment,
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
    if (!event.name || typeof event.name !== "string") {
      throw new Error("event.name must be a non-empty string");
    }
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

  public async destroy(reason?: string): Promise<void> {
    const pendingTeardown: Promise<void>[] = [];
    if (this.browserSession) {
      pendingTeardown.push(this.browserSession.destroy(reason));
    }
    if (this.queue) {
      pendingTeardown.push(this.queue.complete(reason));
    }

    this.bridge.terminate(reason);

    if (pendingTeardown.length > 0) {
      await Promise.allSettled(pendingTeardown);
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
  if (!isRecord(options)) {
    throw new Error("createWebResearchClient options must be an object");
  }

  if (!isRuntimeEnvironment(options.environment)) {
    throw new Error('environment must be one of "dev", "staging", or "prod"');
  }

  return new DefaultWebResearchClient(options);
}
