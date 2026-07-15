import { record as rrwebRecord } from "rrweb";
import type {
  InsightfullActivityEvidenceCallback,
  InsightfullIframeBridgeState,
  InsightfullIframeMessage,
  InsightfullRecorderSafeAttributeValue,
  InsightfullRecorderSafeContext,
  InsightfullRecordingContext,
  InsightfullRecordingActivityEvidenceMessage,
  InsightfullResponseCompletedCallback,
  InsightfullResponseCompletedMessage,
} from "@insightfull/web-research-sdk";

const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const DEFAULT_ACTIVE_BRIDGE_POLL_INTERVAL_MS = 1000;
const DEFAULT_IFRAME_READY_POLL_INTERVAL_MS = 250;
const DEFAULT_IFRAME_READY_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES_PER_CHUNK = 64_000;
const DEFAULT_MAX_EVENTS_PER_CHUNK = 50;
const DEFAULT_MAX_SESSION_BYTES = 5_000_000;
const DEFAULT_MAX_SESSION_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSION_EVENTS = 5000;
const RRWEB_FORMAT_VERSION = "2.1.0";

type RrwebRecordOptions = NonNullable<Parameters<typeof rrwebRecord>[0]>;
type RrwebStopFn = ReturnType<typeof rrwebRecord>;
type InsightfullRrwebRecordOptions = RrwebRecordOptions & {
  maskAllText?: boolean;
};

export type InsightfullRecorderState =
  | "idle"
  | "awaiting_iframe_ready"
  | "recording"
  | "flushing"
  | "completed"
  | "failed"
  | "aborted";

export type InsightfullRecordingFlushReason =
  | "byte_size"
  | "detach"
  | "event_count"
  | "interval"
  | "manual_stop"
  | "max_duration"
  | "max_session_limits"
  | "page_lifecycle"
  | "participant_completed"
  | "study_closed";

export interface InsightfullRecorderCompatibleSDK {
  getIframeBridgeState(): InsightfullIframeBridgeState;
  getRecorderContext(): InsightfullRecorderSafeContext;
  onActivityEvidence?(callback: InsightfullActivityEvidenceCallback): () => void;
  onResponseCompleted?(callback: InsightfullResponseCompletedCallback): () => void;
  sendIframeBridgeMessage(message: InsightfullIframeMessage): boolean;
}

export interface InsightfullRecordingSession {
  context: InsightfullRecordingContext;
  format: "rrweb";
  formatVersion: string;
  recordingSessionId: string;
  startedAt: number;
}

export interface InsightfullRecordingChunk {
  approximateBytes: number;
  chunkIndex: number;
  context: InsightfullRecordingContext;
  events: unknown[];
  flushedAt: number;
  format: "rrweb";
  formatVersion: string;
  reason: InsightfullRecordingFlushReason;
  recordingSessionId: string;
  startedAt: number;
}

export interface InsightfullRecordingFinalization {
  completion: InsightfullResponseCompletedMessage;
  context: InsightfullRecordingContext;
  recordingSessionId: string;
  stopReason: "participant_completed";
}

export interface InsightfullRecorderOptions {
  /** Automatically attempt to start when attached. Manual start() still works when false. */
  enabled?: boolean;
  /** rrweb privacy option. Defaults to true. */
  maskAllInputs?: boolean;
  /** rrweb privacy option. Defaults to true. */
  maskAllText?: boolean;
  /** rrweb DOM blocking class override. */
  blockClass?: RrwebRecordOptions["blockClass"];
  /** rrweb ignore class override. */
  ignoreClass?: RrwebRecordOptions["ignoreClass"];
  /** Create a session in a future backend. Stubbed for MVP tests. */
  createSession?: (session: InsightfullRecordingSession) => Promise<void> | void;
  /** Upload one buffered chunk in a future backend. Stubbed for MVP tests. */
  uploadChunk?: (chunk: InsightfullRecordingChunk) => Promise<void> | void;
  /** Upload verified semantic evidence. Failures do not stop rrweb capture. */
  uploadActivityEvidence?: (
    message: InsightfullRecordingActivityEvidenceMessage,
  ) => Promise<void> | void;
  /** Finalize once after verified participant completion and the final chunk flush attempt. */
  finalizeSession?: (finalization: InsightfullRecordingFinalization) => Promise<void> | void;
  flushIntervalMs?: number;
  iframeReadyPollIntervalMs?: number;
  iframeReadyTimeoutMs?: number;
  maxBytesPerChunk?: number;
  maxEventsPerChunk?: number;
  maxSessionBytes?: number;
  maxSessionDurationMs?: number;
  maxSessionEvents?: number;
}

export interface InsightfullRecorderStateSnapshot {
  activeStudyId: number | null;
  bufferedApproximateBytes: number;
  bufferedEvents: number;
  chunksFlushed: number;
  error: string | null;
  recordingSessionId: string | null;
  state: InsightfullRecorderState;
  totalApproximateBytes: number;
  totalEvents: number;
}

export interface InsightfullRecorderController {
  readonly state: InsightfullRecorderState;
  detach(): Promise<InsightfullRecorderStateSnapshot>;
  getState(): InsightfullRecorderStateSnapshot;
  start(): InsightfullRecorderStateSnapshot;
  stop(): Promise<InsightfullRecorderStateSnapshot>;
}

interface NormalizedRecorderOptions {
  blockClass?: RrwebRecordOptions["blockClass"];
  createSession?: (session: InsightfullRecordingSession) => Promise<void> | void;
  finalizeSession?: (finalization: InsightfullRecordingFinalization) => Promise<void> | void;
  flushIntervalMs: number;
  iframeReadyPollIntervalMs: number;
  iframeReadyTimeoutMs: number;
  ignoreClass?: RrwebRecordOptions["ignoreClass"];
  maskAllInputs: boolean;
  maskAllText: boolean;
  maxBytesPerChunk: number;
  maxEventsPerChunk: number;
  maxSessionBytes: number;
  maxSessionDurationMs: number;
  maxSessionEvents: number;
  uploadChunk?: (chunk: InsightfullRecordingChunk) => Promise<void> | void;
  uploadActivityEvidence?: (
    message: InsightfullRecordingActivityEvidenceMessage,
  ) => Promise<void> | void;
}

export function attachInsightfullRecorder(
  sdk: InsightfullRecorderCompatibleSDK,
  options: InsightfullRecorderOptions = {},
): InsightfullRecorderController {
  return new InsightfullRecorder(sdk, options);
}

class InsightfullRecorder implements InsightfullRecorderController {
  private readonly options: NormalizedRecorderOptions;
  private stateValue: InsightfullRecorderState = "idle";
  private recordingSessionId: string | null = null;
  private recordingContext: InsightfullRecordingContext | null = null;
  private recordingStartedAt = 0;
  private activeStudyId: number | null = null;
  private bufferedEvents: unknown[] = [];
  private bufferedApproximateBytes = 0;
  private totalApproximateBytes = 0;
  private totalEvents = 0;
  private chunksFlushed = 0;
  private nextChunkIndex = 0;
  private lastError: string | null = null;
  private detached = false;
  private bridgePollTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight: Promise<void> = Promise.resolve();
  private finishInFlight: Promise<InsightfullRecorderStateSnapshot> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private readyDeadline = 0;
  private readyPollTimer: ReturnType<typeof setTimeout> | null = null;
  private rrwebStop: RrwebStopFn | null = null;
  private responseCompletionHandled = false;
  private unsubscribeActivityEvidence: (() => void) | null = null;
  private unsubscribeResponseCompleted: (() => void) | null = null;

  private readonly onPageLifecycle = () => {
    if (this.stateValue === "recording" || this.stateValue === "flushing") {
      void this.finish("completed", "page_lifecycle");
      return;
    }
    if (this.stateValue === "awaiting_iframe_ready") {
      void this.detach();
    }
  };

  constructor(
    private readonly sdk: InsightfullRecorderCompatibleSDK,
    options: InsightfullRecorderOptions,
  ) {
    this.options = normalizeOptions(options);
    this.unsubscribeActivityEvidence =
      this.sdk.onActivityEvidence?.((message) => {
        this.handleActivityEvidence(message);
      }) ?? null;
    this.unsubscribeResponseCompleted =
      this.sdk.onResponseCompleted?.((message) => {
        this.handleResponseCompleted(message);
      }) ?? null;
    if (options.enabled !== false) {
      this.start();
    }
  }

  get state(): InsightfullRecorderState {
    return this.stateValue;
  }

  start(): InsightfullRecorderStateSnapshot {
    if (this.detached || this.stateValue === "recording" || this.stateValue === "flushing") {
      return this.getState();
    }

    this.lastError = null;
    const bridgeState = this.sdk.getIframeBridgeState();
    if (!bridgeState.active) {
      this.clearReadyPollTimer();
      this.scheduleBridgePoll();
      this.stateValue = "idle";
      return this.getState();
    }

    this.clearBridgePollTimer();
    if (!bridgeState.ready) {
      this.enterAwaitingIframeReady();
      return this.getState();
    }

    this.startRecording(bridgeState);
    return this.getState();
  }

  async stop(): Promise<InsightfullRecorderStateSnapshot> {
    return this.finish("completed", "manual_stop");
  }

  async detach(): Promise<InsightfullRecorderStateSnapshot> {
    this.detached = true;
    this.unsubscribeBridgeCallbacks();
    return this.finish("aborted", "detach");
  }

  getState(): InsightfullRecorderStateSnapshot {
    return {
      activeStudyId: this.activeStudyId,
      bufferedApproximateBytes: this.bufferedApproximateBytes,
      bufferedEvents: this.bufferedEvents.length,
      chunksFlushed: this.chunksFlushed,
      error: this.lastError,
      recordingSessionId: this.recordingSessionId,
      state: this.stateValue,
      totalApproximateBytes: this.totalApproximateBytes,
      totalEvents: this.totalEvents,
    };
  }

  private enterAwaitingIframeReady(): void {
    this.stateValue = "awaiting_iframe_ready";
    this.readyDeadline = Date.now() + this.options.iframeReadyTimeoutMs;
    this.scheduleReadyPoll();
  }

  private scheduleBridgePoll(): void {
    if (this.bridgePollTimer || this.detached) {
      return;
    }
    this.bridgePollTimer = setTimeout(() => {
      this.bridgePollTimer = null;
      if (!this.detached && this.stateValue === "idle") {
        this.start();
      }
    }, DEFAULT_ACTIVE_BRIDGE_POLL_INTERVAL_MS);
  }

  private scheduleReadyPoll(): void {
    this.clearReadyPollTimer();
    this.readyPollTimer = setTimeout(
      () => this.pollIframeReadiness(),
      this.options.iframeReadyPollIntervalMs,
    );
  }

  private pollIframeReadiness(): void {
    if (this.detached || this.stateValue !== "awaiting_iframe_ready") {
      return;
    }

    const bridgeState = this.sdk.getIframeBridgeState();
    if (!bridgeState.active) {
      this.stateValue = "idle";
      this.scheduleBridgePoll();
      return;
    }

    if (bridgeState.ready) {
      this.startRecording(bridgeState);
      return;
    }

    if (Date.now() >= this.readyDeadline) {
      this.fail(new Error("Timed out waiting for the Insightfull iframe bridge to become ready."));
      return;
    }

    this.scheduleReadyPoll();
  }

  private startRecording(bridgeState: InsightfullIframeBridgeState): void {
    const context = this.buildRecordingContext(bridgeState.studyId);
    if (!context) {
      this.fail(new Error("Cannot start recorder without an active study id."));
      return;
    }

    this.clearReadyPollTimer();
    this.recordingSessionId = createSessionId();
    this.recordingContext = context;
    this.recordingStartedAt = Date.now();
    this.activeStudyId = context.studyId;
    this.bufferedEvents = [];
    this.bufferedApproximateBytes = 0;
    this.totalApproximateBytes = 0;
    this.totalEvents = 0;
    this.chunksFlushed = 0;
    this.nextChunkIndex = 0;
    this.responseCompletionHandled = false;
    this.stateValue = "recording";

    const session: InsightfullRecordingSession = {
      context,
      format: "rrweb",
      formatVersion: RRWEB_FORMAT_VERSION,
      recordingSessionId: this.recordingSessionId,
      startedAt: this.recordingStartedAt,
    };

    if (!this.safeCreateSession(session)) {
      return;
    }
    this.sendSessionMessage("started", context);

    try {
      this.rrwebStop = rrwebRecord(this.buildRrwebOptions());
    } catch (error) {
      this.fail(error);
      return;
    }

    this.addPageLifecycleListeners();
    this.flushTimer = setInterval(() => {
      if (!this.isRecordingBridgeStillActive()) {
        void this.finish("completed", "study_closed");
        return;
      }
      void this.flushCurrentChunk("interval");
    }, this.options.flushIntervalMs);
    this.maxDurationTimer = setTimeout(() => {
      void this.finish("completed", "max_duration");
    }, this.options.maxSessionDurationMs);
  }

  private buildRrwebOptions(): InsightfullRrwebRecordOptions {
    const options: InsightfullRrwebRecordOptions = {
      emit: (event: unknown) => this.handleRecordedEvent(event),
      maskAllInputs: this.options.maskAllInputs,
      maskAllText: this.options.maskAllText,
    };

    if (this.options.maskAllText) {
      options.maskTextSelector = "*";
    }

    if (this.options.blockClass !== undefined) {
      options.blockClass = this.options.blockClass;
    }
    if (this.options.ignoreClass !== undefined) {
      options.ignoreClass = this.options.ignoreClass;
    }

    return options;
  }

  private handleRecordedEvent(event: unknown): void {
    if (this.stateValue !== "recording" || !this.recordingSessionId) {
      return;
    }

    const approximateBytes = approximateJsonBytes(event);
    this.totalEvents += 1;
    this.totalApproximateBytes += approximateBytes;

    this.sdk.sendIframeBridgeMessage({
      event,
      format: "rrweb",
      formatVersion: RRWEB_FORMAT_VERSION,
      recordingSessionId: this.recordingSessionId,
      type: "insightfull.recording_event",
      version: 1,
    });

    this.bufferedEvents.push(event);
    this.bufferedApproximateBytes += approximateBytes;

    if (
      this.totalEvents >= this.options.maxSessionEvents ||
      this.totalApproximateBytes >= this.options.maxSessionBytes
    ) {
      void this.finish("completed", "max_session_limits");
      return;
    }

    if (this.bufferedEvents.length >= this.options.maxEventsPerChunk) {
      void this.flushCurrentChunk("event_count");
      return;
    }

    if (this.bufferedApproximateBytes >= this.options.maxBytesPerChunk) {
      void this.flushCurrentChunk("byte_size");
    }
  }

  private isRecordingBridgeStillActive(): boolean {
    const bridgeState = this.sdk.getIframeBridgeState();
    return bridgeState.active && bridgeState.studyId === this.activeStudyId;
  }

  private finish(
    finalState: "aborted" | "completed",
    reason: InsightfullRecordingFlushReason,
  ): Promise<InsightfullRecorderStateSnapshot> {
    if (
      this.stateValue === "failed" ||
      this.stateValue === "aborted" ||
      this.stateValue === "completed"
    ) {
      return Promise.resolve(this.getState());
    }
    if (this.finishInFlight) {
      return this.finishInFlight;
    }

    this.finishInFlight = this.finishOnce(finalState, reason);
    return this.finishInFlight;
  }

  private async finishOnce(
    finalState: "aborted" | "completed",
    reason: InsightfullRecordingFlushReason,
  ): Promise<InsightfullRecorderStateSnapshot> {
    this.unsubscribeBridgeCallbacks();

    this.clearReadyPollTimer();
    this.clearBridgePollTimer();
    this.clearRuntimeTimers();
    this.stopRrweb();
    this.removePageLifecycleListeners();

    if (!this.recordingSessionId || !this.recordingContext) {
      this.stateValue = finalState;
      return this.getState();
    }

    this.stateValue = "flushing";
    this.sendSessionMessage("stopped", this.recordingContext);
    await this.flushCurrentChunk(reason);
    await this.flushInFlight;

    if (this.lastError === null) {
      this.stateValue = finalState;
    }
    return this.getState();
  }

  private handleActivityEvidence(message: InsightfullRecordingActivityEvidenceMessage): void {
    if (
      this.detached ||
      this.stateValue !== "recording" ||
      message.studyId !== this.activeStudyId ||
      message.evidence.recordingSessionId !== this.recordingSessionId ||
      (this.recordingContext?.responseId !== undefined &&
        message.responseId !== this.recordingContext.responseId) ||
      (this.recordingContext?.sectionResponseId !== undefined &&
        message.sectionResponseId !== this.recordingContext.sectionResponseId)
    ) {
      return;
    }
    try {
      const upload = this.options.uploadActivityEvidence?.(message);
      if (upload) {
        void upload.catch(() => undefined);
      }
    } catch {
      // Semantic evidence is best effort and cannot stop the participant recording.
    }
  }

  private handleResponseCompleted(message: InsightfullResponseCompletedMessage): void {
    if (
      this.detached ||
      this.responseCompletionHandled ||
      (this.stateValue !== "recording" && this.stateValue !== "flushing") ||
      message.studyId !== this.activeStudyId ||
      (this.recordingContext?.responseId !== undefined &&
        this.recordingContext.responseId !== message.responseId)
    ) {
      return;
    }
    this.responseCompletionHandled = true;
    void this.completeParticipantResponse(message);
  }

  private async completeParticipantResponse(
    completion: InsightfullResponseCompletedMessage,
  ): Promise<void> {
    const recordingSessionId = this.recordingSessionId;
    const context = this.recordingContext;
    if (!(recordingSessionId && context)) {
      return;
    }
    const finalContext: InsightfullRecordingContext = {
      ...context,
      responseId: completion.responseId,
    };
    this.recordingContext = finalContext;
    await this.finish("completed", "participant_completed");

    try {
      await this.options.finalizeSession?.({
        completion,
        context: finalContext,
        recordingSessionId,
        stopReason: "participant_completed",
      });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.stateValue = "failed";
    }
  }

  private async flushCurrentChunk(reason: InsightfullRecordingFlushReason): Promise<void> {
    if (!this.recordingSessionId || !this.recordingContext || this.bufferedEvents.length === 0) {
      await this.flushInFlight;
      return;
    }

    const chunk: InsightfullRecordingChunk = {
      approximateBytes: this.bufferedApproximateBytes,
      chunkIndex: this.nextChunkIndex,
      context: this.recordingContext,
      events: this.bufferedEvents.splice(0),
      flushedAt: Date.now(),
      format: "rrweb",
      formatVersion: RRWEB_FORMAT_VERSION,
      reason,
      recordingSessionId: this.recordingSessionId,
      startedAt: this.recordingStartedAt,
    };

    this.nextChunkIndex += 1;
    this.bufferedApproximateBytes = 0;

    const upload = this.flushInFlight.then(async () => {
      await this.options.uploadChunk?.(chunk);
      this.chunksFlushed += 1;
    });
    this.flushInFlight = upload.catch(() => undefined);

    try {
      await upload;
    } catch (error) {
      this.fail(error);
    }
  }

  private buildRecordingContext(studyId: number | null): InsightfullRecordingContext | null {
    const safeContext = this.sdk.getRecorderContext();
    if (!isFiniteNumber(studyId)) {
      return null;
    }

    return copyRecordingContext(safeContext, studyId);
  }

  private safeCreateSession(session: InsightfullRecordingSession): boolean {
    try {
      const result = this.options.createSession?.(session);
      if (result) {
        void result.catch((error) => this.fail(error));
      }
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  private sendSessionMessage(
    state: "started" | "stopped",
    context: InsightfullRecordingContext,
  ): void {
    if (!this.recordingSessionId) {
      return;
    }

    this.sdk.sendIframeBridgeMessage({
      context,
      recordingSessionId: this.recordingSessionId,
      state,
      type: "insightfull.recording_session",
      version: 1,
    });
  }

  private fail(error: unknown): void {
    this.unsubscribeBridgeCallbacks();
    this.clearReadyPollTimer();
    this.clearBridgePollTimer();
    this.clearRuntimeTimers();
    this.stopRrweb();
    this.removePageLifecycleListeners();
    this.lastError = error instanceof Error ? error.message : String(error);
    this.stateValue = "failed";
  }

  private stopRrweb(): void {
    if (typeof this.rrwebStop === "function") {
      this.rrwebStop();
    }
    this.rrwebStop = null;
  }

  private clearReadyPollTimer(): void {
    if (this.readyPollTimer) {
      clearTimeout(this.readyPollTimer);
      this.readyPollTimer = null;
    }
  }

  private clearBridgePollTimer(): void {
    if (this.bridgePollTimer) {
      clearTimeout(this.bridgePollTimer);
      this.bridgePollTimer = null;
    }
  }

  private clearRuntimeTimers(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private addPageLifecycleListeners(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.addEventListener("pagehide", this.onPageLifecycle);
    window.addEventListener("beforeunload", this.onPageLifecycle);
  }

  private removePageLifecycleListeners(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("pagehide", this.onPageLifecycle);
    window.removeEventListener("beforeunload", this.onPageLifecycle);
  }

  private unsubscribeBridgeCallbacks(): void {
    this.unsubscribeActivityEvidence?.();
    this.unsubscribeActivityEvidence = null;
    this.unsubscribeResponseCompleted?.();
    this.unsubscribeResponseCompleted = null;
  }
}

function normalizeOptions(options: InsightfullRecorderOptions): NormalizedRecorderOptions {
  const normalized: NormalizedRecorderOptions = {
    flushIntervalMs: positiveNumber(options.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS),
    iframeReadyPollIntervalMs: positiveNumber(
      options.iframeReadyPollIntervalMs,
      DEFAULT_IFRAME_READY_POLL_INTERVAL_MS,
    ),
    iframeReadyTimeoutMs: positiveNumber(
      options.iframeReadyTimeoutMs,
      DEFAULT_IFRAME_READY_TIMEOUT_MS,
    ),
    maskAllInputs: options.maskAllInputs ?? true,
    maskAllText: options.maskAllText ?? true,
    maxBytesPerChunk: positiveNumber(options.maxBytesPerChunk, DEFAULT_MAX_BYTES_PER_CHUNK),
    maxEventsPerChunk: positiveNumber(options.maxEventsPerChunk, DEFAULT_MAX_EVENTS_PER_CHUNK),
    maxSessionBytes: positiveNumber(options.maxSessionBytes, DEFAULT_MAX_SESSION_BYTES),
    maxSessionDurationMs: positiveNumber(
      options.maxSessionDurationMs,
      DEFAULT_MAX_SESSION_DURATION_MS,
    ),
    maxSessionEvents: positiveNumber(options.maxSessionEvents, DEFAULT_MAX_SESSION_EVENTS),
  };

  if (options.blockClass !== undefined) {
    normalized.blockClass = options.blockClass;
  }
  if (options.ignoreClass !== undefined) {
    normalized.ignoreClass = options.ignoreClass;
  }
  if (options.createSession !== undefined) {
    normalized.createSession = options.createSession;
  }
  if (options.uploadChunk !== undefined) {
    normalized.uploadChunk = options.uploadChunk;
  }
  if (options.uploadActivityEvidence !== undefined) {
    normalized.uploadActivityEvidence = options.uploadActivityEvidence;
  }
  if (options.finalizeSession !== undefined) {
    normalized.finalizeSession = options.finalizeSession;
  }

  return normalized;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function approximateJsonBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json ? json.length : String(value).length;
  } catch {
    return 0;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecorderSafeAttributeValue(
  value: unknown,
): value is InsightfullRecorderSafeAttributeValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function copySafeAttributes(
  attributes: unknown,
): Record<string, InsightfullRecorderSafeAttributeValue> {
  const copied: Record<string, InsightfullRecorderSafeAttributeValue> = {};
  if (!isRecord(attributes)) {
    return copied;
  }
  for (const [key, value] of Object.entries(attributes)) {
    if (isRecorderSafeAttributeValue(value)) {
      copied[key] = value;
    }
  }
  return copied;
}

function copySafeCustomId(customId: unknown): Record<string, string> {
  const copied: Record<string, string> = {};
  if (!isRecord(customId)) {
    return copied;
  }
  for (const [key, value] of Object.entries(customId)) {
    if (typeof value === "string") {
      copied[key] = value;
    }
  }
  return copied;
}

function sanitizeUrl(url: string): string {
  if (typeof url !== "string" || url.length === 0) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    const strippedUrl = stripQueryAndHash(url);
    return strippedUrl.startsWith("/") ? strippedUrl : "";
  }
}

function stripQueryAndHash(value: string): string {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
}

function copyRecordingContext(
  safeContext: InsightfullRecorderSafeContext,
  studyId: number,
): InsightfullRecordingContext {
  const context: InsightfullRecordingContext = {
    customAttributes: copySafeAttributes(safeContext.customAttributes),
    customId: copySafeCustomId(safeContext.customId),
    path: typeof safeContext.path === "string" ? safeContext.path : "",
    sdkEnvironmentId:
      typeof safeContext.sdkEnvironmentId === "string" ? safeContext.sdkEnvironmentId : "",
    studyId,
    url: sanitizeUrl(safeContext.url),
    userId: typeof safeContext.userId === "string" ? safeContext.userId : null,
    visitorId: typeof safeContext.visitorId === "string" ? safeContext.visitorId : "",
  };

  if (isFiniteNumber(safeContext.responseId)) {
    context.responseId = safeContext.responseId;
  }
  if (isFiniteNumber(safeContext.sectionResponseId)) {
    context.sectionResponseId = safeContext.sectionResponseId;
  }

  return context;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
