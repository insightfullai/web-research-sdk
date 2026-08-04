import { AutoTracker } from "./auto-tracker/auto-tracker.js";
import { fetchConfig } from "./config-fetcher/config-fetcher.js";
import {
  evaluateTriggersWithDiagnostics,
  type TriggerEvaluationResult,
  setCooldown,
} from "./evaluation-engine/evaluation-engine.js";
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
  InsightfullDeliveryEvaluation,
  InsightfullDeliveryEvaluationCallback,
  InsightfullDeliveryOutcome,
  InsightfullDeliveryReasonCode,
  InsightfullExplainDeliveryOptions,
  InsightfullAppearanceOptions,
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
import { SDK_VERSION } from "./version.js";

const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 100;
const BATCH_SIZE = 20;
const VISITOR_ID_KEY = "insightfull_visitor_id";
const MAX_DELIVERY_STUDIES = 20;
const MAX_DELIVERY_TRIGGERS = 10;
const MAX_DELIVERY_FILTERS = 10;

export type InsightfullSdkStatus = "destroyed" | "initializing" | "ready" | "unavailable";
export type InsightfullInitializationErrorCode = "configuration_unavailable" | "sdk_destroyed";

export class InsightfullInitializationError extends Error {
  readonly code: InsightfullInitializationErrorCode;

  constructor(code: InsightfullInitializationErrorCode, message: string) {
    super(message);
    this.name = "InsightfullInitializationError";
    this.code = code;
  }
}

export class InsightfullSDK {
  private readonly clientId: string;
  private readonly apiBase: string;
  private visitorId: string;
  private _userId: string | null = null;
  private readonly customId: Record<string, string> = {};
  private readonly attributes: Record<string, unknown> = {};
  private config: SdkConfig | null = null;
  private readonly configReady: Promise<void>;
  private _status: InsightfullSdkStatus = "initializing";
  private _initializationError: InsightfullInitializationError | null = null;
  private readonly eventQueue: EventQueue;
  private readonly pendingTriggerEvaluations: Array<{
    eventName: string;
    hostContext?: HostContextV1;
  }> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private autoTracker: AutoTracker | null = null;
  private readonly iframeBridge: InsightfullIframeBridge;
  private readonly appearance: InsightfullAppearanceOptions | undefined;
  private readonly studyRenderer: InsightfullStudyRenderer | undefined;
  private readonly activityEvidenceCallbacks = new Set<InsightfullActivityEvidenceCallback>();
  private readonly responseCompletedCallbacks = new Set<InsightfullResponseCompletedCallback>();
  private readonly deliveryEvaluationCallbacks = new Set<InsightfullDeliveryEvaluationCallback>();
  private readonly displayStateCallbacks = new Set<
    (state: InsightfullIframeDisplayState) => void
  >();
  private customRendererCleanup: (() => void) | null = null;
  private activeStudyId: number | null = null;
  private activeStudyDisplayState: InsightfullIframeDisplayState | null = null;
  private directLaunchActive = false;
  private _lastDeliveryEvaluation: InsightfullDeliveryEvaluation | null = null;
  private destroyed = false;

  get baseApiUrl(): string {
    return this.apiBase;
  }

  get currentVisitorId(): string {
    return this.visitorId;
  }

  get userId(): string | null {
    return this._userId;
  }

  get currentCustomIds(): Readonly<Record<string, string>> {
    return { ...this.customId };
  }

  get currentAttributes(): Readonly<Record<string, unknown>> {
    return { ...this.attributes };
  }

  get currentStudyId(): number | null {
    return this.activeStudyId;
  }

  get currentStudyDisplayState(): InsightfullIframeDisplayState | null {
    return this.activeStudyDisplayState;
  }

  get status(): InsightfullSdkStatus {
    return this._status;
  }

  get version(): string {
    return SDK_VERSION;
  }

  get initializationError(): InsightfullInitializationError | null {
    return this._initializationError;
  }

  get lastDeliveryEvaluation(): InsightfullDeliveryEvaluation | null {
    return this._lastDeliveryEvaluation;
  }

  get queueSize(): number {
    return this.eventQueue.size();
  }

  getIframeBridgeState(): InsightfullIframeBridgeState {
    return this.iframeBridge.getState();
  }

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

  onActivityEvidence(callback: InsightfullActivityEvidenceCallback): () => void {
    if (this.destroyed) {
      return () => undefined;
    }
    this.activityEvidenceCallbacks.add(callback);
    return () => this.activityEvidenceCallbacks.delete(callback);
  }

  onResponseCompleted(callback: InsightfullResponseCompletedCallback): () => void {
    if (this.destroyed) {
      return () => undefined;
    }
    this.responseCompletedCallbacks.add(callback);
    return () => this.responseCompletedCallbacks.delete(callback);
  }

  onDeliveryEvaluation(callback: InsightfullDeliveryEvaluationCallback): () => void {
    if (this.destroyed) {
      return () => undefined;
    }
    this.deliveryEvaluationCallbacks.add(callback);
    return () => this.deliveryEvaluationCallbacks.delete(callback);
  }

  /** Explain the current delivery decision without displaying a study or changing cooldowns. */
  explainDelivery(
    eventName: string,
    options?: InsightfullExplainDeliveryOptions,
  ): InsightfullDeliveryEvaluation {
    return this.evaluateDelivery(eventName, options?.pathname ?? this.getCurrentPathname())
      .evaluation;
  }

  sendIframeBridgeMessage(message: InsightfullIframeMessage): boolean {
    if (this.destroyed) {
      return false;
    }
    return this.iframeBridge.send(message);
  }

  minimizeStudy(): void {
    this.setActiveStudyDisplayState("minimized");
  }

  expandStudy(): void {
    this.setActiveStudyDisplayState("expanded");
  }

  dismissStudy(): void {
    this.cleanupActiveStudy();
  }

  get hasActiveFlushTimer(): boolean {
    return this.flushTimer !== null;
  }

  get hasActiveAutoTracker(): boolean {
    return this.autoTracker !== null;
  }

  constructor(options: InsightfullInitOptions) {
    this.clientId = options.clientId;
    this.apiBase = options.apiBase ?? "https://insightfull.ai";
    this.appearance = options.appearance;
    this.studyRenderer = options.renderStudy;
    this.visitorId = this.getOrCreateVisitorId();

    if (options.onActivityEvidence) {
      this.activityEvidenceCallbacks.add(options.onActivityEvidence);
    }
    if (options.onResponseCompleted) {
      this.responseCompletedCallbacks.add(options.onResponseCompleted);
    }
    if (options.onDeliveryEvaluation) {
      this.deliveryEvaluationCallbacks.add(options.onDeliveryEvaluation);
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
    this.configReady = this.fetchConfig();
  }

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

  setAttributes(attributes: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
  }

  removeAttributes(keys: readonly string[]): void {
    if (this.destroyed) {
      return;
    }
    for (const key of keys) {
      delete this.attributes[key];
      this.enqueueEvent({
        type: "attribute",
        timestamp: Date.now(),
        key,
        value: null,
      } as SdkEvent);
    }
  }

  async ready(): Promise<void> {
    await this.configReady;
    if (this._status === "ready") {
      return;
    }
    throw (
      this._initializationError ??
      new InsightfullInitializationError("sdk_destroyed", "The Insightfull SDK was destroyed")
    );
  }

  async reset(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    await this.eventQueue.flush();
    this.eventQueue.clear();
    this.cleanupActiveStudy();
    this.pendingTriggerEvaluations.length = 0;
    this.directLaunchActive = false;
    this._userId = null;
    for (const key of Object.keys(this.customId)) {
      delete this.customId[key];
    }
    for (const key of Object.keys(this.attributes)) {
      delete this.attributes[key];
    }
    this.visitorId = this.generateId();
    try {
      localStorage.setItem(VISITOR_ID_KEY, this.visitorId);
    } catch {}
  }

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

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.cleanupActiveStudy();
    this.destroyed = true;
    this._status = "destroyed";
    this._initializationError = new InsightfullInitializationError(
      "sdk_destroyed",
      "The Insightfull SDK was destroyed",
    );

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.autoTracker) {
      this.autoTracker.stop();
      this.autoTracker = null;
    }
    this.iframeBridge.destroy();
    this.activityEvidenceCallbacks.clear();
    this.responseCompletedCallbacks.clear();
    this.deliveryEvaluationCallbacks.clear();

    await this.eventQueue.flush();
  }

  static init(options: InsightfullInitOptions): InsightfullSDK {
    return new InsightfullSDK(options);
  }

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
      return this.generateId();
    }
  }

  private generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  private async fetchConfig(): Promise<void> {
    const config = await fetchConfig(this.apiBase, this.clientId);
    if (this.destroyed) {
      return;
    }
    if (!config) {
      this._status = "unavailable";
      this._initializationError = new InsightfullInitializationError(
        "configuration_unavailable",
        "Insightfull configuration is unavailable for this environment",
      );
      this.flushPendingTriggerEvaluations();
      return;
    }

    this.config = config;
    this._status = "ready";
    this._initializationError = null;
    this.launchDirectStudy();
    this.flushPendingTriggerEvaluations();
  }

  private flushPendingTriggerEvaluations(): void {
    const pendingEvaluations = this.pendingTriggerEvaluations.splice(0);
    for (const evaluation of pendingEvaluations) {
      this.evaluateAndShow(evaluation.eventName, evaluation.hostContext);
    }
  }

  private startAutoTracking(): void {
    this.autoTracker = new AutoTracker((eventName, payload) => {
      this.enqueueEvent({
        type: "pageview",
        name: eventName,
        timestamp: Date.now(),
        url: payload?.url as string | undefined,
        payload,
      } as SdkEvent);

      this.evaluateAndShow(eventName);
    });
    this.autoTracker.start();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.eventQueue.flush();
    }, FLUSH_INTERVAL_MS);
  }

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

  private handleDisplayStateChange(state: InsightfullIframeDisplayState, studyId: number): void {
    if (studyId !== this.activeStudyId) {
      return;
    }
    this.setActiveStudyDisplayState(state);
  }

  private setActiveStudyDisplayState(state: InsightfullIframeDisplayState): void {
    if (this.destroyed || this.activeStudyId === null) {
      return;
    }
    this.activeStudyDisplayState = state;
    if (!this.studyRenderer) {
      setStudyDisplayState(this.activeStudyId, state);
    }
    for (const callback of this.displayStateCallbacks) {
      try {
        callback(state);
      } catch {
        // Host render callbacks cannot break the participant experience.
      }
    }
  }

  private subscribeToDisplayState(
    callback: (state: InsightfullIframeDisplayState) => void,
  ): () => void {
    this.displayStateCallbacks.add(callback);
    if (this.activeStudyDisplayState) {
      callback(this.activeStudyDisplayState);
    }
    return () => this.displayStateCallbacks.delete(callback);
  }

  private cleanupActiveStudy(): void {
    const studyId = this.activeStudyId;
    const cleanup = this.customRendererCleanup;
    this.customRendererCleanup = null;
    if (cleanup) {
      try {
        cleanup();
      } catch {
        // Cleanup is best effort and must not block SDK teardown.
      }
    }
    this.displayStateCallbacks.clear();
    if (studyId !== null) {
      removeStudy(studyId);
      this.iframeBridge.unregisterIframe(studyId);
    }
    this.activeStudyId = null;
    this.activeStudyDisplayState = null;
    this.directLaunchActive = false;
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

  private notifyDeliveryEvaluation(evaluation: InsightfullDeliveryEvaluation): void {
    this._lastDeliveryEvaluation = evaluation;
    for (const callback of this.deliveryEvaluationCallbacks) {
      try {
        callback(evaluation);
      } catch {
        // Diagnostics callbacks cannot interrupt participant delivery.
      }
    }
    this.enqueueEvent({
      payload: this.toDeliveryTelemetryPayload(evaluation),
      timestamp: evaluation.timestamp,
      type: "delivery",
      url: evaluation.pathname,
    });
  }

  private async flushBatch(batch: SdkEvent[]): Promise<void> {
    await sendTelemetry(
      this.apiBase,
      this.clientId,
      this.visitorId,
      this._userId,
      batch,
      SDK_VERSION,
    );
  }

  private evaluateAndShow(eventName: string, hostContext?: HostContextV1): void {
    const result = this.evaluateDelivery(eventName, this.getCurrentPathname());
    if (result.evaluation.reasonCode === "configuration_pending") {
      this.pendingTriggerEvaluations.push({
        eventName,
        ...(hostContext ? { hostContext } : {}),
      });
      this.notifyDeliveryEvaluation(result.evaluation);
      return;
    }
    if (!result.matchedStudy) {
      this.notifyDeliveryEvaluation(result.evaluation);
      return;
    }

    const didPresent = this.showStudy(result.matchedStudy, eventName, hostContext);
    const evaluation: InsightfullDeliveryEvaluation = didPresent
      ? { ...result.evaluation, outcome: "presented" }
      : { ...result.evaluation, outcome: "suppressed", reasonCode: "renderer_failed" };
    if (didPresent) {
      setCooldown(result.matchedStudy.id);
    }
    this.notifyDeliveryEvaluation(evaluation);
  }

  private launchDirectStudy(): void {
    if (!this.config || typeof window === "undefined") {
      return;
    }
    const launchUrl = new URL(window.location.href);
    const shareUrl = launchUrl.searchParams.get("instfl_study")?.trim();
    if (!shareUrl) {
      return;
    }

    const fragmentValue = launchUrl.hash.slice(1);
    const fragmentQueryIndex = fragmentValue.indexOf("?");
    const fragmentPrefix =
      fragmentQueryIndex >= 0 ? fragmentValue.slice(0, fragmentQueryIndex) : "";
    const launchFragment = new URLSearchParams(
      fragmentQueryIndex >= 0 ? fragmentValue.slice(fragmentQueryIndex + 1) : fragmentValue,
    );
    const agentLaunchToken =
      launchFragment.get("instfl_agent")?.trim() ??
      launchUrl.searchParams.get("instfl_agent")?.trim();
    const study = this.config.studies.find((candidate) => candidate.shareUrl === shareUrl);
    if (!study) {
      return;
    }

    const didPresent = this.showStudy(study, "direct_launch", undefined, agentLaunchToken);
    this.directLaunchActive = this.activeStudyId === study.id;
    this.notifyDeliveryEvaluation({
      eventName: "direct_launch",
      outcome: didPresent ? "presented" : "suppressed",
      pathname: this.getCurrentPathname(),
      reasonCode: didPresent ? "matched" : "renderer_failed",
      selectedStudyId: study.id,
      studies: [
        {
          outcome: didPresent ? "matched" : "suppressed",
          reasonCode: didPresent ? "matched" : "renderer_failed",
          studyId: study.id,
          triggers: [],
        },
      ],
      timestamp: Date.now(),
    });
    if (!agentLaunchToken) {
      return;
    }

    launchUrl.searchParams.delete("instfl_agent");
    launchFragment.delete("instfl_agent");
    const remainingFragment = launchFragment.toString();
    launchUrl.hash = fragmentPrefix
      ? `${fragmentPrefix}${remainingFragment ? `?${remainingFragment}` : ""}`
      : remainingFragment;
    window.history.replaceState(window.history.state, "", launchUrl);
  }

  private showStudy(
    study: StudyContent,
    triggerEvent: string,
    hostContext?: HostContextV1,
    agentLaunchToken?: string,
  ): boolean {
    this.cleanupActiveStudy();
    const iframeBridgeNonce = this.generateId();
    this.activeStudyId = study.id;
    this.activeStudyDisplayState = "expanded";
    const context: SdkContext = {
      visitorId: this.visitorId,
      userId: this._userId,
      customId: { ...this.customId },
      customAttributes: { ...this.attributes },
      iframeBridge: { nonce: iframeBridgeNonce, version: 1 },
      sdkEnvironmentId: this.clientId,
      sdkVersion: SDK_VERSION,
      source: triggerEvent === "direct_launch" ? "in_app" : "web_sdk",
      triggerEvent,
      ...(agentLaunchToken ? { agentLaunchToken } : {}),
      ...(hostContext ? { hostContext } : {}),
    };

    if (this.studyRenderer) {
      this.iframeBridge.unregisterIframe();
      const renderPayload = buildStudyRenderPayload(this.apiBase, study, context, {
        dismissStudy: () => this.dismissStudy(),
        expandStudy: () => this.expandStudy(),
        minimizeStudy: () => this.minimizeStudy(),
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
            this.iframeBridge.unregisterIframe(studyId);
          };
        },
        subscribeToDisplayState: (callback) => this.subscribeToDisplayState(callback),
      });
      try {
        this.customRendererCleanup = this.studyRenderer(renderPayload) ?? null;
      } catch {
        this.cleanupActiveStudy();
        return false;
      }
      return true;
    }

    this.iframeBridge.unregisterIframe();
    try {
      renderStudy(this.apiBase, study, context, {
        ...(this.appearance ? { appearance: this.appearance } : {}),
        onBeforeRemoveExisting: () => this.iframeBridge.unregisterIframe(study.id),
        onDisplayStateRequest: (state) => this.setActiveStudyDisplayState(state),
        onIframeCreated: ({ iframe, iframeUrl, nonce, studyId }) => {
          if (!nonce) {
            return;
          }
          this.iframeBridge.registerIframe({ iframe, iframeUrl, nonce, studyId });
        },
      });
      return true;
    } catch {
      this.cleanupActiveStudy();
      return false;
    }
  }

  private evaluateDelivery(eventName: string, pathname: string): TriggerEvaluationResult {
    const timestamp = Date.now();
    if (this.destroyed) {
      return {
        evaluation: this.createStateEvaluation(
          eventName,
          pathname,
          "suppressed",
          "sdk_destroyed",
          timestamp,
        ),
        matchedStudy: null,
      };
    }
    if (this.directLaunchActive) {
      return {
        evaluation: this.createStateEvaluation(
          eventName,
          pathname,
          "suppressed",
          "direct_launch_active",
          timestamp,
        ),
        matchedStudy: null,
      };
    }
    if (this.activeStudyId !== null) {
      return {
        evaluation: this.createStateEvaluation(
          eventName,
          pathname,
          "suppressed",
          "active_study_present",
          timestamp,
        ),
        matchedStudy: null,
      };
    }
    if (!this.config) {
      const isUnavailable = this._status === "unavailable";
      return {
        evaluation: this.createStateEvaluation(
          eventName,
          pathname,
          isUnavailable ? "suppressed" : "deferred",
          isUnavailable ? "configuration_unavailable" : "configuration_pending",
          timestamp,
        ),
        matchedStudy: null,
      };
    }

    const globalSettings: GlobalSettings = this.config.globalSettings;
    return evaluateTriggersWithDiagnostics(
      eventName,
      this.attributes,
      this.customId,
      this.config.studies,
      globalSettings,
      pathname,
      timestamp,
    );
  }

  private createStateEvaluation(
    eventName: string,
    pathname: string,
    outcome: InsightfullDeliveryOutcome,
    reasonCode: InsightfullDeliveryReasonCode,
    timestamp: number,
  ): InsightfullDeliveryEvaluation {
    return {
      eventName,
      outcome,
      pathname,
      reasonCode,
      selectedStudyId: null,
      studies: [],
      timestamp,
    };
  }

  private getCurrentPathname(): string {
    return typeof window === "undefined" ? "" : window.location.pathname;
  }

  private toDeliveryTelemetryPayload(
    evaluation: InsightfullDeliveryEvaluation,
  ): Record<string, unknown> {
    return {
      eventName: evaluation.eventName,
      outcome: evaluation.outcome,
      reasonCode: evaluation.reasonCode,
      selectedStudyId: evaluation.selectedStudyId,
      studies: evaluation.studies.slice(0, MAX_DELIVERY_STUDIES).map((study) => ({
        outcome: study.outcome,
        reasonCode: study.reasonCode,
        studyId: study.studyId,
        triggers: study.triggers.slice(0, MAX_DELIVERY_TRIGGERS).map((trigger) => ({
          eventName: trigger.eventName,
          filters: trigger.filters.slice(0, MAX_DELIVERY_FILTERS).map((filter) => ({
            matched: filter.matched,
            operator: filter.operator,
            property: filter.property,
          })),
          index: trigger.index,
          isActive: trigger.isActive,
          matchOn: trigger.matchOn,
          outcome: trigger.outcome,
          priority: trigger.priority,
          reasonCode: trigger.reasonCode,
        })),
      })),
    };
  }
}
