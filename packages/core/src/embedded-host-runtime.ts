import {
  isNonEmptyString,
  isRecord,
  WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
  WEB_RESEARCH_PROTOCOL_VERSION,
  WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
  type WebResearchTaskAbandonSignalMessage,
  type WebResearchTaskCompleteSignalMessage,
  type WebResearchHandshakeInitMessage,
} from "@insightfull/web-research-sdk-contracts";

import { createPostMessageTransport } from "./transport";
import type {
  BrowserSessionController,
  SignalTaskAbandonOptions,
  SignalTaskCompleteOptions,
  SdkLifecycleState,
  StartBrowserSessionOptions,
  TrackCustomEventOptions,
  WebResearchClient,
} from "./types";

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;

export interface EmbeddedHostRuntimeOptions {
  client: WebResearchClient;
  iframeSrc: string;
  targetOrigin?: string;
  container?: HTMLElement;
  handshakeTimeoutMs?: number;
  captureOptions?: Omit<StartBrowserSessionOptions, "transport">;
  overlay?: import("./types").EmbeddedOverlayOptions;
  onStateChange?: (
    state: SdkLifecycleState,
    previousState: SdkLifecycleState,
    context?: import("./types").SdkStateChangeContext,
  ) => void;
}

export interface EmbeddedHostRuntimeController {
  mount: () => void;
  getState: () => SdkLifecycleState;
  getSnapshot: () => {
    state: SdkLifecycleState;
    handshakeElapsedMs: number | null;
    lastFlushAt: string | null;
    bufferedEvents: number;
  };
  getIframe: () => HTMLIFrameElement | null;
  signalTaskComplete: (options: SignalTaskCompleteOptions) => Promise<void>;
  signalTaskAbandon: (options: SignalTaskAbandonOptions) => Promise<void>;
  trackCustomEvent: (options: TrackCustomEventOptions) => Promise<void>;
  destroy: (reason?: string) => Promise<void>;
}

function resolveTargetOrigin(iframeSrc: string, explicitTargetOrigin?: string): string {
  const candidate = explicitTargetOrigin ?? iframeSrc;
  const parsed = new URL(candidate);
  const isLocalHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new Error("targetOrigin must be https (or localhost for tests)");
  }

  return parsed.origin;
}

class EmbeddedHostRuntime implements EmbeddedHostRuntimeController {
  private readonly targetOrigin: string;
  private readonly handshakeTimeoutMs: number;
  private readonly onMessage = (event: MessageEvent<unknown>) => {
    this.receiveMessage(event.data, event.origin, event.source);
  };
  private readonly onIframeLoad = () => {
    this.handleIframeLoad();
  };

  private state: SdkLifecycleState = "UNMOUNTED";
  private iframe: HTMLIFrameElement | null = null;
  private browserSession: BrowserSessionController | undefined;
  private handshakeTimer: number | undefined;
  private teardownPromise: Promise<void> | undefined;
  private completionPromise: Promise<void> | undefined;
  private completed = false;
  private handshakeStartedAt: number | undefined;

  public constructor(private readonly options: EmbeddedHostRuntimeOptions) {
    this.targetOrigin = resolveTargetOrigin(options.iframeSrc, options.targetOrigin);
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  }

  public mount(): void {
    if (this.teardownPromise && this.state !== "TERMINATED") {
      throw new Error("Cannot mount while teardown is in progress. Await destroy() first.");
    }
    if (this.iframe || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const overlay = this.options.overlay;
    const position = overlay?.position ?? "bottom-right";
    const offset = overlay?.offset ?? "16px";

    const iframe = document.createElement("iframe");
    iframe.src = this.options.iframeSrc;
    iframe.title = "Insightfull overlay";
    iframe.allow = "microphone; camera; autoplay";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.style.position = "fixed";
    iframe.style.width = overlay?.width ?? "420px";
    iframe.style.height = overlay?.height ?? "640px";
    iframe.style.border = "0";
    iframe.style.zIndex = overlay?.zIndex ?? "2147483600";

    if (position === "center") {
      iframe.style.top = "50%";
      iframe.style.left = "50%";
      iframe.style.transform = "translate(-50%, -50%)";
    } else if (position === "bottom-right") {
      iframe.style.right = offset;
      iframe.style.bottom = offset;
    } else if (position === "bottom-left") {
      iframe.style.left = offset;
      iframe.style.bottom = offset;
    } else if (position === "top-right") {
      iframe.style.right = offset;
      iframe.style.top = offset;
    } else if (position === "top-left") {
      iframe.style.left = offset;
      iframe.style.top = offset;
    }

    this.iframe = iframe;
    this.setState("IFRAME_LOADING");
    iframe.addEventListener("load", this.onIframeLoad);
    window.addEventListener("message", this.onMessage);

    const container = this.options.container ?? document.body;
    container.appendChild(iframe);
  }

  public getState(): SdkLifecycleState {
    return this.state;
  }

  public getSnapshot(): {
    state: SdkLifecycleState;
    handshakeElapsedMs: number | null;
    lastFlushAt: string | null;
    bufferedEvents: number;
  } {
    return {
      state: this.state,
      handshakeElapsedMs:
        this.handshakeStartedAt != null ? Date.now() - this.handshakeStartedAt : null,
      lastFlushAt: this.browserSession?.getSnapshot()?.lastFlushAt ?? null,
      bufferedEvents: this.browserSession?.getSnapshot()?.bufferedEvents ?? 0,
    };
  }

  public getIframe(): HTMLIFrameElement | null {
    return this.iframe;
  }

  public async destroy(reason = "destroy"): Promise<void> {
    if (!this.teardownPromise) {
      this.teardownPromise = this.teardown(reason);
    }

    await this.teardownPromise;
  }

  public async signalTaskComplete(options: SignalTaskCompleteOptions): Promise<void> {
    this.assertValidTaskId(options.taskId);
    await this.finalizeWithTaskSignal({
      type: WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
      version: WEB_RESEARCH_PROTOCOL_VERSION,
      session: this.options.client.getSession(),
      sentAt: new Date().toISOString(),
      signal: "task_complete",
      status: "completed",
      taskId: options.taskId,
      evidence: normalizeEvidence(options.evidence),
    });
  }

  public async signalTaskAbandon(options: SignalTaskAbandonOptions): Promise<void> {
    this.assertValidTaskId(options.taskId);
    if (!isNonEmptyString(options.reason)) {
      throw new Error("signalTaskAbandon requires a non-empty reason");
    }

    await this.finalizeWithTaskSignal({
      type: WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
      version: WEB_RESEARCH_PROTOCOL_VERSION,
      session: this.options.client.getSession(),
      sentAt: new Date().toISOString(),
      signal: "task_abandon",
      status: "abandoned",
      taskId: options.taskId,
      reason: options.reason,
      evidence: normalizeEvidence(options.evidence),
    });
  }

  public async trackCustomEvent(options: TrackCustomEventOptions): Promise<void> {
    if (!isNonEmptyString(options.name)) {
      throw new Error("trackCustomEvent requires a non-empty name");
    }

    if (this.completed) {
      return;
    }

    await this.options.client.track({
      name: options.name,
      payload: options.payload ?? {},
    });
  }

  private handleIframeLoad(): void {
    const iframeWindow = this.iframe?.contentWindow;
    if (!iframeWindow) {
      this.setState("DEGRADED", { reason: "iframe contentWindow unavailable" });
      return;
    }

    this.handshakeStartedAt = Date.now();
    this.setState("HANDSHAKE_PENDING");
    const initMessage: WebResearchHandshakeInitMessage = {
      type: WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
      version: WEB_RESEARCH_PROTOCOL_VERSION,
      session: this.options.client.getSession(),
      sentAt: new Date().toISOString(),
    };
    iframeWindow.postMessage(initMessage, this.targetOrigin);

    this.clearHandshakeTimer();
    this.handshakeTimer = window.setTimeout(() => {
      this.setState("DEGRADED", { reason: "handshake_timeout" });
    }, this.handshakeTimeoutMs);
  }

  public receiveMessage(message: unknown, origin: string, source?: MessageEventSource | null): void {
    const iframeWindow = this.iframe?.contentWindow;
    if (!iframeWindow || origin !== this.targetOrigin) {
      return;
    }

    if (source && source !== iframeWindow) {
      return;
    }

    if (!isHandshakeReadyMessage(message)) {
      return;
    }

    if (message.session.sessionId !== this.options.client.getSession().sessionId) {
      return;
    }

    this.clearHandshakeTimer();
    this.setState("READY");
    if (!this.browserSession) {
      const transport = createPostMessageTransport({
        targetWindow: iframeWindow,
        targetOrigin: this.targetOrigin,
      });
      this.browserSession = this.options.client.startBrowserSession({
        ...this.options.captureOptions,
        transport,
      });
    }
  }

  private clearHandshakeTimer(): void {
    if (!this.handshakeTimer) {
      return;
    }

    window.clearTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
  }

  private setState(nextState: SdkLifecycleState, context?: import("./types").SdkStateChangeContext): void {
    const previousState = this.state;
    this.state = nextState;
    if (nextState === "DEGRADED") {
      console.warn(
        `[EmbeddedHostRuntime] state transitioned to DEGRADED${context?.reason ? `: ${context.reason}` : ""}`,
      );
    }
    this.options.onStateChange?.(nextState, previousState, context);
  }

  private assertValidTaskId(taskId: string): void {
    if (!isNonEmptyString(taskId)) {
      throw new Error("taskId must be a non-empty string");
    }
  }

  private async finalizeWithTaskSignal(
    message: WebResearchTaskCompleteSignalMessage | WebResearchTaskAbandonSignalMessage,
  ): Promise<void> {
    if (this.completionPromise) {
      await this.completionPromise;
      return;
    }

    if (this.state !== "READY") {
      throw new Error(
        `Cannot emit task signal in state ${this.state}. ` +
          `Current state must be READY. Destroy and recreate the runtime.`,
      );
    }

    this.completionPromise = (async () => {
      this.postTaskSignal(message);
      await this.options.client.complete(message.signal);
      this.completed = true;
      await this.destroy(message.signal);
    })();

    try {
      await this.completionPromise;
    } catch (error) {
      this.completionPromise = undefined;
      throw error;
    }
  }

  private postTaskSignal(
    message: WebResearchTaskCompleteSignalMessage | WebResearchTaskAbandonSignalMessage,
  ): void {
    const iframeWindow = this.iframe?.contentWindow;
    if (!iframeWindow) {
      throw new Error("Cannot emit task signal before iframe is mounted");
    }

    iframeWindow.postMessage(message, this.targetOrigin);
  }

  private async teardown(reason: string): Promise<void> {
    this.clearHandshakeTimer();

    if (typeof window !== "undefined") {
      window.removeEventListener("message", this.onMessage);
    }

    if (this.browserSession) {
      await this.browserSession.destroy(reason);
      this.browserSession = undefined;
    }

    if (this.iframe) {
      this.iframe.removeEventListener("load", this.onIframeLoad);
      this.iframe.remove();
      this.iframe = null;
    }

    this.completed = true;
    this.setState("TERMINATED");
  }
}

function normalizeEvidence(
  evidence: { note?: string; metadata?: Record<string, unknown> } | undefined,
): {
  note?: string;
  metadata?: Record<string, unknown>;
} {
  if (!evidence) {
    return {};
  }

  const normalized: { note?: string; metadata?: Record<string, unknown> } = {};
  if (isNonEmptyString(evidence.note)) {
    normalized.note = evidence.note;
  }
  if (evidence.metadata && isRecord(evidence.metadata)) {
    normalized.metadata = evidence.metadata;
  }

  return normalized;
}

function isHandshakeReadyMessage(message: unknown): message is {
  type: typeof WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE;
  version: typeof WEB_RESEARCH_PROTOCOL_VERSION;
  session: { sessionId: string };
} {
  if (!isRecord(message) || !isRecord(message.session)) {
    return false;
  }

  return (
    message.type === WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE &&
    message.version === WEB_RESEARCH_PROTOCOL_VERSION &&
    typeof message.session.sessionId === "string" &&
    message.session.sessionId.length > 0
  );
}

export function createEmbeddedHostRuntime(
  options: EmbeddedHostRuntimeOptions,
): EmbeddedHostRuntimeController {
  return new EmbeddedHostRuntime(options);
}
