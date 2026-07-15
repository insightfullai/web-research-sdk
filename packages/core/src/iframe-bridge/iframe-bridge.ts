import {
  isActivityEvidenceMessage,
  isRecordingContextMessage,
  isResponseCompletedMessage,
  type InsightfullActivityEvidenceCallback,
  type InsightfullResponseCompletedCallback,
} from "./participant-bridge-contracts.js";

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
  recordingSessionId: string | null;
  responseId: number | null;
  sectionResponseId: number | null;
  targetOrigin: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class InsightfullIframeBridge {
  private active: ActiveIframeBridge | null = null;
  private readonly maxQueueSize: number;
  private readonly onActivityEvidence: InsightfullActivityEvidenceCallback | null;
  private readonly onDisplayStateChange: InsightfullDisplayStateCallback | null;
  private readonly onResponseCompleted: InsightfullResponseCompletedCallback | null;
  private readonly completedResponseIds = new Set<number>();
  private readonly onMessage = (event: MessageEvent) => this.handleIncomingMessage(event);

  constructor(
    options: {
      maxQueueSize?: number;
      onActivityEvidence?: InsightfullActivityEvidenceCallback;
      onDisplayStateChange?: InsightfullDisplayStateCallback;
      onResponseCompleted?: InsightfullResponseCompletedCallback;
    } = {},
  ) {
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_IFRAME_QUEUE_SIZE;
    this.onActivityEvidence = options.onActivityEvidence ?? null;
    this.onDisplayStateChange = options.onDisplayStateChange ?? null;
    this.onResponseCompleted = options.onResponseCompleted ?? null;
    if (typeof window !== "undefined") {
      window.addEventListener("message", this.onMessage);
    }
  }

  destroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("message", this.onMessage);
    }
    this.active = null;
    this.completedResponseIds.clear();
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

  getResponseContext(): { responseId?: number; sectionResponseId?: number } {
    const active = this.active;
    if (!active?.responseId) {
      return {};
    }
    return {
      responseId: active.responseId,
      ...(active.sectionResponseId ? { sectionResponseId: active.sectionResponseId } : {}),
    };
  }

  registerIframe(registration: InsightfullIframeRegistration): InsightfullIframeBridgeState {
    this.active = {
      ...registration,
      queue: [],
      ready: false,
      recordingSessionId: null,
      responseId: null,
      sectionResponseId: null,
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
    this.syncOutgoingSessionContext(this.active, message);
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

    if (data.type === "insightfull.recording_context") {
      this.handleRecordingContextMessage(active, data);
      return;
    }

    if (data.type === "insightfull.recording_activity_evidence") {
      this.handleActivityEvidenceMessage(active, data);
      return;
    }

    if (data.type === "insightfull.response_completed") {
      this.handleResponseCompletedMessage(active, data);
    }
  }

  private handleReadyMessage(active: ActiveIframeBridge, data: Record<string, unknown>): void {
    if (!this.matchesActiveIdentity(active, data, ["type", "version", "studyId", "nonce"])) {
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
    if (
      !this.matchesActiveIdentity(active, data, ["type", "version", "state", "studyId", "nonce"])
    ) {
      return;
    }

    const state = data.state;
    if (state !== "expanded" && state !== "minimized") {
      return;
    }

    this.onDisplayStateChange?.(state, active.studyId);
  }

  private matchesActiveIdentity(
    active: ActiveIframeBridge,
    data: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): boolean {
    return (
      Object.keys(data).every((key) => allowedKeys.includes(key)) &&
      Object.keys(data).length === allowedKeys.length &&
      data.version === 1 &&
      data.studyId === active.studyId &&
      typeof data.nonce === "string" &&
      data.nonce.length >= 16 &&
      data.nonce.length <= 256 &&
      data.nonce === active.nonce
    );
  }

  private handleRecordingContextMessage(active: ActiveIframeBridge, data: unknown): void {
    if (
      !isRecordingContextMessage(data) ||
      data.studyId !== active.studyId ||
      data.nonce !== active.nonce
    ) {
      return;
    }
    active.responseId = data.responseId;
    active.sectionResponseId = data.sectionResponseId ?? null;
  }

  private handleActivityEvidenceMessage(active: ActiveIframeBridge, data: unknown): void {
    if (
      !isActivityEvidenceMessage(data) ||
      data.studyId !== active.studyId ||
      data.nonce !== active.nonce ||
      data.responseId !== active.responseId ||
      (data.sectionResponseId ?? null) !== active.sectionResponseId ||
      data.evidence.recordingSessionId !== active.recordingSessionId
    ) {
      return;
    }
    this.onActivityEvidence?.(data);
  }

  private handleResponseCompletedMessage(active: ActiveIframeBridge, data: unknown): void {
    if (
      !isResponseCompletedMessage(data) ||
      data.studyId !== active.studyId ||
      data.nonce !== active.nonce ||
      data.responseId !== active.responseId ||
      this.completedResponseIds.has(data.responseId)
    ) {
      return;
    }
    this.completedResponseIds.add(data.responseId);
    this.onResponseCompleted?.(data);
  }

  private syncOutgoingSessionContext(
    active: ActiveIframeBridge,
    message: InsightfullIframeMessage,
  ): void {
    if (message.type !== "insightfull.recording_session" || message.state !== "started") {
      return;
    }
    if (message.context.studyId !== active.studyId) {
      return;
    }
    active.recordingSessionId = message.recordingSessionId;
    if (typeof message.context.responseId === "number" && message.context.responseId > 0) {
      active.responseId = message.context.responseId;
    }
    if (
      typeof message.context.sectionResponseId === "number" &&
      message.context.sectionResponseId > 0
    ) {
      active.sectionResponseId = message.context.sectionResponseId;
    }
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
