const DEFAULT_MAX_IFRAME_QUEUE_SIZE = 50;

export type InsightfullRecorderSafeAttributeValue = string | number | boolean | null;

export interface InsightfullRecorderSafeContext {
  activeStudyId: number | null;
  customAttributes: Record<string, InsightfullRecorderSafeAttributeValue>;
  customId: Record<string, string>;
  path: string;
  responseId?: number;
  sdkEnvironmentId: string;
  sectionResponseId?: number;
  url: string;
  userId: string | null;
  visitorId: string;
}

export interface InsightfullRecordingContext {
  customAttributes: Record<string, InsightfullRecorderSafeAttributeValue>;
  customId: Record<string, string>;
  path: string;
  responseId?: number;
  sdkEnvironmentId: string;
  sectionResponseId?: number;
  studyId: number;
  url: string;
  userId: string | null;
  visitorId: string;
}

export interface InsightfullRecordingSessionMessage {
  context: InsightfullRecordingContext;
  recordingSessionId: string;
  state: "started" | "stopped";
  type: "insightfull.recording_session";
  version: 1;
}

export interface InsightfullRecordingLiveEventMessage {
  event: unknown;
  format: string;
  formatVersion: string;
  recordingSessionId: string;
  type: "insightfull.recording_event";
  version: 1;
}

export type InsightfullIframeMessage =
  | InsightfullRecordingLiveEventMessage
  | InsightfullRecordingSessionMessage;

export interface InsightfullIframeReadyMessage {
  nonce: string;
  studyId: number;
  type: "insightfull.iframe_ready";
  version: 1;
}

/**
 * Display states the iframe can request the host SDK to apply.
 * - "expanded": full-size iframe overlay (default).
 * - "minimized": small pill/tab at the bottom; iframe contentWindow stays alive.
 */
export type InsightfullIframeDisplayState = "expanded" | "minimized";

/**
 * Message sent FROM the study iframe TO the host SDK to request a display
 * state change. Used by in-app testing to collapse the iframe so the
 * participant can interact with their real application.
 */
export interface InsightfullIframeDisplayStateMessage {
  nonce: string;
  state: InsightfullIframeDisplayState;
  studyId: number;
  type: "insightfull.iframe_display_state";
  version: 1;
}

export interface InsightfullIframeBridgeState {
  active: boolean;
  queueSize: number;
  ready: boolean;
  studyId: number | null;
  targetOrigin: string | null;
}

/**
 * Callback invoked when the iframe requests a display state change.
 * The host SDK applies the state to the rendered container.
 */
export type InsightfullDisplayStateCallback = (
  state: InsightfullIframeDisplayState,
  studyId: number,
) => void;

export interface InsightfullIframeRegistration {
  iframe: HTMLIFrameElement;
  iframeUrl: string;
  nonce: string;
  studyId: number;
}

interface ActiveIframeBridge extends InsightfullIframeRegistration {
  queue: InsightfullIframeMessage[];
  ready: boolean;
  targetOrigin: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class InsightfullIframeBridge {
  private active: ActiveIframeBridge | null = null;
  private readonly maxQueueSize: number;
  private readonly onDisplayStateChange: InsightfullDisplayStateCallback | null;
  private readonly onMessage = (event: MessageEvent) => this.handleIncomingMessage(event);

  constructor(
    options: {
      maxQueueSize?: number;
      onDisplayStateChange?: InsightfullDisplayStateCallback;
    } = {},
  ) {
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_IFRAME_QUEUE_SIZE;
    this.onDisplayStateChange = options.onDisplayStateChange ?? null;
    if (typeof window !== "undefined") {
      window.addEventListener("message", this.onMessage);
    }
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("message", this.onMessage);
    }
    this.active = null;
  }

  getState(): InsightfullIframeBridgeState {
    if (!this.active) {
      return {
        active: false,
        queueSize: 0,
        ready: false,
        studyId: null,
        targetOrigin: null,
      };
    }
    return {
      active: true,
      queueSize: this.active.queue.length,
      ready: this.active.ready,
      studyId: this.active.studyId,
      targetOrigin: this.active.targetOrigin,
    };
  }

  registerIframe(registration: InsightfullIframeRegistration): InsightfullIframeBridgeState {
    this.active = {
      ...registration,
      queue: [],
      ready: false,
      targetOrigin: new URL(registration.iframeUrl, window.location.href).origin,
    };
    return this.getState();
  }

  unregisterIframe(studyId?: number): void {
    if (studyId !== undefined && this.active?.studyId !== studyId) {
      return;
    }
    this.active = null;
  }

  send(message: InsightfullIframeMessage): boolean {
    if (!this.active) {
      return false;
    }
    if (this.active.ready) {
      return this.postToActiveIframe(this.active, message);
    }
    if (this.active.queue.length >= this.maxQueueSize) {
      this.active.queue.shift();
    }
    this.active.queue.push(message);
    return true;
  }

  private handleIncomingMessage(event: MessageEvent): void {
    const active = this.active;
    if (!active || event.origin !== active.targetOrigin) {
      return;
    }
    if (event.source !== active.iframe.contentWindow) {
      return;
    }
    const data = event.data;
    if (!isRecord(data)) {
      return;
    }

    if (data.type === "insightfull.iframe_ready") {
      this.handleReadyMessage(active, data);
      return;
    }

    if (data.type === "insightfull.iframe_display_state") {
      this.handleDisplayStateMessage(active, data);
      return;
    }
  }

  private handleReadyMessage(active: ActiveIframeBridge, data: Record<string, unknown>): void {
    if (data.version !== 1 || data.studyId !== active.studyId || data.nonce !== active.nonce) {
      return;
    }

    active.ready = true;
    const queued = active.queue.splice(0);
    for (const message of queued) {
      this.postToActiveIframe(active, message);
    }
  }

  private handleDisplayStateMessage(
    active: ActiveIframeBridge,
    data: Record<string, unknown>,
  ): void {
    if (data.version !== 1 || data.studyId !== active.studyId || data.nonce !== active.nonce) {
      return;
    }

    const state = data.state;
    if (state !== "expanded" && state !== "minimized") {
      return;
    }

    this.onDisplayStateChange?.(state, active.studyId);
  }

  private postToActiveIframe(
    active: ActiveIframeBridge,
    message: InsightfullIframeMessage,
  ): boolean {
    if (!active.iframe.contentWindow) {
      return false;
    }
    active.iframe.contentWindow.postMessage(message, active.targetOrigin);
    return true;
  }
}
