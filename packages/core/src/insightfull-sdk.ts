/**
 * InsightfullSDK — the main SDK class for event-triggered study delivery.
 *
 * Usage:
 *   const sdk = InsightfullSDK.init({ clientId: "env_abc123" });
 *   sdk.identify("user_123", { plan: "pro" });
 *   sdk.track("checkout_completed", { total: 99.99 });
 */

import { AutoTracker } from "./auto-tracker/auto-tracker.js";
import { fetchConfig } from "./config-fetcher/config-fetcher.js";
import { evaluateTriggers, setCooldown } from "./evaluation-engine/evaluation-engine.js";
import { EventQueue } from "./event-queue/event-queue.js";
import { InsightfullIframeBridge } from "./iframe-bridge/iframe-bridge.js";
import {
  buildStudyRenderPayload,
  removeStudy,
  renderStudy,
  setStudyDisplayState,
} from "./iframe-renderer/iframe-renderer.js";
import { sendTelemetry } from "./telemetry-sender/telemetry-sender.js";
import type {
  InsightfullIframeBridgeState,
  InsightfullIframeDisplayState,
  InsightfullIframeMessage,
  InsightfullRecorderSafeAttributeValue,
  InsightfullRecorderSafeContext,
} from "./iframe-bridge/iframe-bridge.js";
import type {
  InsightfullActivityEvidenceCallback,
  InsightfullRecordingActivityEvidenceMessage,
  InsightfullResponseCompletedCallback,
  InsightfullResponseCompletedMessage,
} from "./iframe-bridge/participant-bridge-contracts.js";
import type {
  GlobalSettings,
  HostContextV1,
  InsightfullInitOptions,
  InsightfullStudyRenderer,
  InsightfullTrackOptions,
  SdkConfig,
  SdkContext,
  SdkEvent,
  StudyContent,
} from "./types/index.js";
import { validateHostContext } from "./types/host-context.types.js";

const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 100;
const BATCH_SIZE = 20;
const SDK_VERSION = "1.0.0";
const VISITOR_ID_KEY = "insightfull_visitor_id";

export class InsightfullSDK {
  private readonly clientId: string;
  private readonly apiBase: string;
  private readonly visitorId: string;
  private _userId: string | null = null;
  private readonly customId: Record<string, string> = {};
  private readonly attributes: Record<string, unknown> = {};
  private config: SdkConfig | null = null;
  private readonly eventQueue: EventQueue;
  private readonly pendingTriggerEvaluations: Array<{
    eventName: string;
    hostContext?: HostContextV1;
  }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private autoTracker: AutoTracker | null = null;
  private readonly iframeBridge: InsightfullIframeBridge;
  private readonly studyRenderer: InsightfullStudyRenderer | undefined;
  private readonly activityEvidenceCallbacks = new Set<InsightfullActivityEvidenceCallback>();
  private readonly responseCompletedCallbacks = new Set<InsightfullResponseCompletedCallback>();
  private customRendererDisplayStateCallback:
    | ((state: InsightfullIframeDisplayState) => void)
    | null = null;
  private activeStudyId: number | null = null;
  private destroyed = false;

  /** The configured API base URL. */
  get baseApiUrl(): string {
    return this.apiBase;
  }

  /** The persistent visitor ID assigned to this browser. */
  get currentVisitorId(): string {
    return this.visitorId;
  }

  /** The identified user ID, or null if not yet identified. */
  get userId(): string | null {
    return this._userId;
  }

  /** Read-only snapshot of current custom identifiers. */
  get currentCustomIds(): Readonly<Record<string, string>> {
    return { ...this.customId };
  }

  /** Read-only snapshot of current custom attributes. */
  get currentAttributes(): Readonly<Record<string, unknown>> {
    return { ...this.attributes };
  }

  /** Number of events currently in the queue. */
  get queueSize(): number {
    return this.eventQueue.size();
  }

  /** Current iframe bridge state for recorder integrations. */
  getIframeBridgeState(): InsightfullIframeBridgeState {
    return this.iframeBridge.getState();
  }

  /** Snapshot of recorder-safe SDK context. Excludes nested/custom object attributes. */
  getRecorderContext(): InsightfullRecorderSafeContext {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    return {
      activeStudyId: this.activeStudyId,
      customAttributes: this.getRecorderSafeAttributes(),
      customId: { ...this.customId },
      path,
      sdkEnvironmentId: this.clientId,
      url,
      userId: this._userId,
      visitorId: this.visitorId,
      ...this.iframeBridge.getResponseContext(),
    };
  }

  /** Subscribe to strict activity evidence from the verified active study iframe. */
  onActivityEvidence(callback: InsightfullActivityEvidenceCallback): () => void {
    if (this.destroyed) {
      return () => undefined;
    }
    this.activityEvidenceCallbacks.add(callback);
    return () => this.activityEvidenceCallbacks.delete(callback);
  }

  /** Subscribe to server-confirmed completion from the verified active study iframe. */
  onResponseCompleted(callback: InsightfullResponseCompletedCallback): () => void {
    if (this.destroyed) {
      return () => undefined;
    }
    this.responseCompletedCallbacks.add(callback);
    return () => this.responseCompletedCallbacks.delete(callback);
  }

  /** Send a bridge message to the active study iframe. Safe no-op when no iframe is active. */
  sendIframeBridgeMessage(message: InsightfullIframeMessage): boolean {
    if (this.destroyed) {
      return false;
    }
    return this.iframeBridge.send(message);
  }

  /**
   * Minimize the active study to a small pill. The iframe contentWindow stays
   * alive so the postMessage bridge and recorder keep working.
   * Safe no-op when no study is active.
   */
  minimizeStudy(): void {
    if (this.activeStudyId !== null) {
      setStudyDisplayState(this.activeStudyId, "minimized");
    }
  }

  /**
   * Expand the active study back to its full-size overlay.
   * Safe no-op when no study is active.
   */
  expandStudy(): void {
    if (this.activeStudyId !== null) {
      setStudyDisplayState(this.activeStudyId, "expanded");
    }
  }

  /** Whether the periodic flush timer is active. */
  get hasActiveFlushTimer(): boolean {
    return this.flushTimer !== null;
  }

  /** Whether auto-tracking is currently active. */
  get hasActiveAutoTracker(): boolean {
    return this.autoTracker !== null;
  }

  constructor(options: InsightfullInitOptions) {
    this.clientId = options.clientId;
    this.apiBase = options.apiBase ?? "https://insightfull.ai";
    this.studyRenderer = options.renderStudy;
    this.visitorId = this.getOrCreateVisitorId();

    if (options.onActivityEvidence) {
      this.activityEvidenceCallbacks.add(options.onActivityEvidence);
    }
    if (options.onResponseCompleted) {
      this.responseCompletedCallbacks.add(options.onResponseCompleted);
    }

    this.iframeBridge = new InsightfullIframeBridge({
      onActivityEvidence: (message) => this.notifyActivityEvidence(message),
      onDisplayStateChange: (state, studyId) => this.handleDisplayStateChange(state, studyId),
      onResponseCompleted: (message) => this.notifyResponseCompleted(message),
    });

    this.eventQueue = new EventQueue({
      maxSize: MAX_QUEUE_SIZE,
      batchSize: BATCH_SIZE,
      onFlush: (batch) => this.flushBatch(batch),
    });

    if (options.autoTrack !== false) {
      this.startAutoTracking();
    }

    this.startFlushTimer();
    void this.fetchConfig();
  }

  // ──── Public API ────

  /**
   * Identify a user and optionally merge traits into attributes.
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (this.destroyed) {
      return;
    }
    this._userId = userId;
    if (traits) {
      Object.assign(this.attributes, traits);
    }
    this.enqueueEvent({
      type: "identify",
      timestamp: Date.now(),
    });
  }

  /**
   * Set a custom identifier (key-value pair).
   */
  setCustomId(key: string, value: string): void {
    if (this.destroyed) {
      return;
    }
    this.customId[key] = value;
    this.enqueueEvent({
      type: "attribute",
      timestamp: Date.now(),
      key: `customId.${key}`,
      value,
    } as SdkEvent);
  }

  /**
   * Set a custom attribute.
   */
  setAttribute(key: string, value: unknown): void {
    if (this.destroyed) {
      return;
    }
    this.attributes[key] = value;
    this.enqueueEvent({
      type: "attribute",
      timestamp: Date.now(),
      key,
      value,
    } as SdkEvent);
  }

  /**
   * Track a custom event and evaluate triggers.
   */
  track(
    eventName: string,
    payload?: Record<string, unknown>,
    options?: InsightfullTrackOptions,
  ): void {
    if (this.destroyed) {
      return;
    }
    this.enqueueEvent({
      type: "event",
      name: eventName,
      timestamp: Date.now(),
      payload,
    } as SdkEvent);
    const hostContext =
      options?.hostContext === undefined ? undefined : validateHostContext(options.hostContext);
    this.evaluateAndShow(eventName, hostContext ?? undefined);
  }

  /**
   * Destroy the SDK instance — stop tracking, flush queue, clean up.
   */
  async destroy(): Promise<void> {
    this.destroyed = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.autoTracker) {
      this.autoTracker.stop();
      this.autoTracker = null;
    }
    this.activeStudyId = null;
    this.iframeBridge.destroy();
    this.activityEvidenceCallbacks.clear();
    this.responseCompletedCallbacks.clear();

    // Final flush — await to prevent unhandled promise rejections and data loss
    await this.eventQueue.flush();
  }

  /**
   * Static factory method.
   */
  static init(options: InsightfullInitOptions): InsightfullSDK {
    return new InsightfullSDK(options);
  }

  // ──── Private Methods ────

  /**
   * Get or create a persistent visitor ID in localStorage.
   */
  private getOrCreateVisitorId(): string {
    try {
      const existing = localStorage.getItem(VISITOR_ID_KEY);
      if (existing) {
        return existing;
      }

      const newId = this.generateId();
      localStorage.setItem(VISITOR_ID_KEY, newId);
      return newId;
    } catch {
      // Fallback for environments without localStorage
      return this.generateId();
    }
  }

  /**
   * Generate a UUID v4. Uses crypto.randomUUID() when available
   * (secure contexts), falls back to Math.random() otherwise.
   */
  private generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /**
   * Fetch and cache the SDK config from the backend.
   */
  private async fetchConfig(): Promise<void> {
    const config = await fetchConfig(this.apiBase, this.clientId);
    if (!config || this.destroyed) {
      return;
    }

    this.config = config;
    this.flushPendingTriggerEvaluations();
  }

  private flushPendingTriggerEvaluations(): void {
    const pendingEvaluations = this.pendingTriggerEvaluations.splice(0);
    for (const evaluation of pendingEvaluations) {
      this.evaluateAndShow(evaluation.eventName, evaluation.hostContext);
    }
  }

  /**
   * Start auto-tracking pageviews.
   */
  private startAutoTracking(): void {
    this.autoTracker = new AutoTracker((eventName, payload) => {
      this.enqueueEvent({
        type: "pageview",
        name: eventName,
        timestamp: Date.now(),
        url: payload?.url as string | undefined,
        payload,
      } as SdkEvent);

      // Also evaluate triggers on pageview events
      this.evaluateAndShow(eventName);
    });
    this.autoTracker.start();
  }

  /**
   * Start the periodic flush timer.
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.eventQueue.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Add an event to the queue.
   */
  private enqueueEvent(event: SdkEvent): void {
    this.eventQueue.push(event);
  }

  private getRecorderSafeAttributes(): Record<string, InsightfullRecorderSafeAttributeValue> {
    const safeAttributes: Record<string, InsightfullRecorderSafeAttributeValue> = {};
    for (const [key, value] of Object.entries(this.attributes)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        safeAttributes[key] = value;
      }
    }
    return safeAttributes;
  }

  private clearActiveStudy(studyId: number): void {
    if (this.activeStudyId === studyId) {
      this.activeStudyId = null;
    }
  }

  /**
   * Handle a display state change requested by the study iframe via bridge.
   * For the default renderer, applies the state to the DOM container.
   * For custom renderers, forwards to the renderer's onDisplayStateChange callback.
   */
  private handleDisplayStateChange(state: InsightfullIframeDisplayState, studyId: number): void {
    if (this.studyRenderer) {
      this.customRendererDisplayStateCallback?.(state);
      return;
    }
    setStudyDisplayState(studyId, state);
  }

  private notifyActivityEvidence(message: InsightfullRecordingActivityEvidenceMessage): void {
    for (const callback of this.activityEvidenceCallbacks) {
      try {
        callback(message);
      } catch {
        // Host callbacks cannot break the iframe bridge or participant flow.
      }
    }
  }

  private notifyResponseCompleted(message: InsightfullResponseCompletedMessage): void {
    for (const callback of this.responseCompletedCallbacks) {
      try {
        callback(message);
      } catch {
        // Completion is already server-confirmed; host callbacks are best effort.
      }
    }
  }

  /**
   * Send a batch of telemetry events to the backend.
   */
  private async flushBatch(batch: SdkEvent[]): Promise<void> {
    await sendTelemetry(this.apiBase, this.clientId, this.visitorId, this._userId, batch);
  }

  /**
   * Evaluate triggers for an event and show a matching study if found.
   */
  private evaluateAndShow(eventName: string, hostContext?: HostContextV1): void {
    if (!this.config) {
      this.pendingTriggerEvaluations.push({
        eventName,
        ...(hostContext ? { hostContext } : {}),
      });
      return;
    }

    const globalSettings: GlobalSettings = this.config.globalSettings;
    const matchedStudy = evaluateTriggers(
      eventName,
      this.attributes,
      this.customId,
      this.config.studies,
      globalSettings,
      window.location.pathname,
    );

    if (matchedStudy) {
      this.showStudy(matchedStudy, eventName, hostContext);
      setCooldown(matchedStudy.id);
    }
  }

  /**
   * Show a study in a positioned iframe.
   */
  private showStudy(study: StudyContent, triggerEvent: string, hostContext?: HostContextV1): void {
    const iframeBridgeNonce = this.generateId();
    this.activeStudyId = study.id;
    const context: SdkContext = {
      visitorId: this.visitorId,
      userId: this._userId,
      customId: { ...this.customId },
      customAttributes: { ...this.attributes },
      iframeBridge: { nonce: iframeBridgeNonce, version: 1 },
      sdkEnvironmentId: this.clientId,
      sdkVersion: SDK_VERSION,
      source: "web_sdk",
      triggerEvent,
      ...(hostContext ? { hostContext } : {}),
    };

    if (this.studyRenderer) {
      this.iframeBridge.unregisterIframe();
      const renderPayload = buildStudyRenderPayload(this.apiBase, study, context, {
        removeDefaultStudy: () => {
          removeStudy(study.id);
        },
        registerIframeBridge: ({ iframe, iframeUrl, nonce, studyId }) => {
          if (!nonce) {
            return () => undefined;
          }
          this.iframeBridge.registerIframe({
            iframe,
            iframeUrl,
            nonce,
            studyId,
          });
          return () => {
            this.clearActiveStudy(studyId);
            this.iframeBridge.unregisterIframe(studyId);
          };
        },
      });
      this.customRendererDisplayStateCallback = renderPayload.onDisplayStateChange ?? null;
      this.studyRenderer(renderPayload);
      return;
    }

    this.iframeBridge.unregisterIframe();
    renderStudy(this.apiBase, study, context, {
      onBeforeRemoveExisting: () => this.iframeBridge.unregisterIframe(study.id),
      onIframeCreated: ({ iframe, iframeUrl, nonce, studyId }) => {
        if (!nonce) {
          return;
        }
        this.iframeBridge.registerIframe({ iframe, iframeUrl, nonce, studyId });
      },
    });
  }
}
