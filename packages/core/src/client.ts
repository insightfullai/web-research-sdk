import type { SdkEvent, SessionMetadata } from "./protocol";

import { OverlayBridgeRuntime } from "./bridge";
import type { WebResearchClient, WebResearchClientOptions } from "./types";

const DEFAULT_ENDPOINT = "https://api.insightfull.ai/web-research";

class DefaultWebResearchClient implements WebResearchClient {
  private readonly session: SessionMetadata;
  private readonly endpoint: string;
  public readonly bridge: OverlayBridgeRuntime;
  private readonly trackedEvents: SdkEvent[] = [];

  public constructor(options: WebResearchClientOptions) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
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
  }

  public getLifecycleState() {
    return this.bridge.getState();
  }

  public destroy(reason?: string): void {
    this.bridge.terminate(reason);
  }
}

export function createWebResearchClient(options: WebResearchClientOptions): WebResearchClient {
  if (!options.apiKey) {
    throw new Error("apiKey is required");
  }

  return new DefaultWebResearchClient(options);
}
