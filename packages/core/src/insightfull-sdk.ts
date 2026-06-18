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
import { renderStudy } from "./iframe-renderer/iframe-renderer.js";
import { sendTelemetry } from "./telemetry-sender/telemetry-sender.js";
import type {
  GlobalSettings,
  InsightfullInitOptions,
  SdkConfig,
  SdkContext,
  SdkEvent,
  StudyContent,
} from "./types/index.js";

const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 100;
const BATCH_SIZE = 20;
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
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private autoTracker: AutoTracker | null = null;
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
    this.apiBase = options.apiBase ?? "https://app.insightfull.ai";
    this.visitorId = this.getOrCreateVisitorId();

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
  track(eventName: string, payload?: Record<string, unknown>): void {
    if (this.destroyed) {
      return;
    }
    this.enqueueEvent({
      type: "event",
      name: eventName,
      timestamp: Date.now(),
      payload,
    } as SdkEvent);
    this.evaluateAndShow(eventName);
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
    if (config) {
      this.config = config;
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

  /**
   * Send a batch of telemetry events to the backend.
   */
  private async flushBatch(batch: SdkEvent[]): Promise<void> {
    await sendTelemetry(this.apiBase, this.clientId, this.visitorId, this._userId, batch);
  }

  /**
   * Evaluate triggers for an event and show a matching study if found.
   */
  private evaluateAndShow(eventName: string): void {
    if (!this.config) {
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
      this.showStudy(matchedStudy, eventName);
      setCooldown(matchedStudy.id);
    }
  }

  /**
   * Show a study in a positioned iframe.
   */
  private showStudy(study: StudyContent, triggerEvent: string): void {
    const context: SdkContext = {
      visitorId: this.visitorId,
      userId: this._userId,
      customId: { ...this.customId },
      customAttributes: { ...this.attributes },
      sdkEnvironmentId: this.clientId,
      source: "web_sdk",
      triggerEvent,
    };

    renderStudy(this.apiBase, study, context);
  }
}
