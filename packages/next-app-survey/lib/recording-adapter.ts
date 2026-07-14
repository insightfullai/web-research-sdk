"use client";

import type {
  InsightfullIframeBridgeState,
  InsightfullIframeMessage,
} from "@insightfull/web-research-sdk";
import type {
  InsightfullRecorderCompatibleSDK,
  InsightfullRecordingChunk,
  InsightfullRecordingSession,
} from "@insightfull/web-research-sdk-recorder";

const RESPONSE_CONTEXT_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;
const TRAILING_SLASH = /\/$/;

interface RecordingContextMessage {
  nonce: string;
  responseId: number;
  sectionResponseId?: number;
  studyId: number;
  type: "insightfull.recording_context";
  version: 1;
}

interface CreatedRecordingSession {
  capabilityToken: string;
  recordingSessionId: string;
  sdkEnvironmentId: number;
}

interface ActiveRecording {
  backend: CreatedRecordingSession;
  recordingSessionId: string;
  startedAt: number;
}

interface RecordingTotals {
  bytes: number;
  chunks: number;
  events: number;
  lastChunkSequence: number;
}

interface IframeRegistration {
  iframe: HTMLIFrameElement;
  nonce: string;
  studyId: number;
  targetOrigin: string;
}

interface TrpcEnvelope<T> {
  result?: { data?: { json?: T } | T };
}

export type RecordingAdapterStatus =
  | "awaiting-response-context"
  | "creating-session"
  | "recording"
  | "finalizing"
  | "completed"
  | "partial"
  | "degraded";

export interface RecordingAdapterOptions {
  apiBase: string;
  onStatusChange?: (status: RecordingAdapterStatus) => void;
  requestTimeoutMs?: number;
  responseContextTimeoutMs?: number;
  retryDelay?: (milliseconds: number) => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const parseResponseContext = (value: unknown): RecordingContextMessage | null => {
  if (!isRecord(value)) {
    return null;
  }
  const allowedKeys = new Set([
    "nonce",
    "responseId",
    "sectionResponseId",
    "studyId",
    "type",
    "version",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }
  if (
    value.type !== "insightfull.recording_context" ||
    value.version !== 1 ||
    typeof value.nonce !== "string" ||
    value.nonce.length < 16 ||
    !isPositiveInteger(value.responseId) ||
    !isPositiveInteger(value.studyId) ||
    (value.sectionResponseId !== undefined && !isPositiveInteger(value.sectionResponseId))
  ) {
    return null;
  }
  return {
    nonce: value.nonce,
    responseId: value.responseId,
    ...(value.sectionResponseId === undefined
      ? {}
      : { sectionResponseId: value.sectionResponseId }),
    studyId: value.studyId,
    type: "insightfull.recording_context",
    version: 1,
  };
};

const decodeIframeContext = (iframeUrl: string): Record<string, unknown> | null => {
  try {
    const encoded = new URL(iframeUrl, window.location.href).searchParams.get("ctx");
    if (!encoded) {
      return null;
    }
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(decoded);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const findIframeRegistration = (
  bridgeState: InsightfullIframeBridgeState,
): IframeRegistration | null => {
  if (!(bridgeState.active && bridgeState.studyId && bridgeState.targetOrigin)) {
    return null;
  }
  const host = document.getElementById(`insightfull-study-${bridgeState.studyId}`);
  const iframe = host?.querySelector("iframe");
  if (!(iframe instanceof HTMLIFrameElement && iframe.contentWindow)) {
    return null;
  }
  const context = decodeIframeContext(iframe.src);
  const iframeBridge = context?.iframeBridge;
  if (
    !isRecord(iframeBridge) ||
    typeof iframeBridge.nonce !== "string" ||
    iframeBridge.nonce.length < 16 ||
    new URL(iframe.src, window.location.href).origin !== bridgeState.targetOrigin
  ) {
    return null;
  }
  return {
    iframe,
    nonce: iframeBridge.nonce,
    studyId: bridgeState.studyId,
    targetOrigin: bridgeState.targetOrigin,
  };
};

const findIframeRegistrationFromContext = (
  context: RecordingContextMessage,
): IframeRegistration | null => {
  const host = document.getElementById(`insightfull-study-${context.studyId}`);
  const iframe = host?.querySelector("iframe");
  if (!(iframe instanceof HTMLIFrameElement && iframe.contentWindow)) {
    return null;
  }
  const iframeContext = decodeIframeContext(iframe.src);
  const iframeBridge = iframeContext?.iframeBridge;
  if (
    !isRecord(iframeBridge) ||
    iframeBridge.nonce !== context.nonce ||
    typeof iframeBridge.nonce !== "string" ||
    iframeBridge.nonce.length < 16
  ) {
    return null;
  }
  const targetOrigin = new URL(iframe.src, window.location.href).origin;
  if (targetOrigin === "null" || targetOrigin === "*") {
    return null;
  }
  return {
    iframe,
    nonce: iframeBridge.nonce,
    studyId: context.studyId,
    targetOrigin,
  };
};

class ResponseContextCoordinator {
  private readonly getIframeBridgeState: () => InsightfullIframeBridgeState;
  private readonly contexts = new Map<number, RecordingContextMessage>();

  private readonly onMessage = (event: MessageEvent): void => {
    const context = parseResponseContext(event.data);
    if (!context) {
      return;
    }
    const registration =
      findIframeRegistration(this.getIframeBridgeState()) ??
      findIframeRegistrationFromContext(context);
    if (
      !registration ||
      event.origin !== registration.targetOrigin ||
      event.source !== registration.iframe.contentWindow ||
      context.studyId !== registration.studyId ||
      context.nonce !== registration.nonce
    ) {
      return;
    }
    this.contexts.set(context.studyId, context);
    window.dispatchEvent(new CustomEvent(`insightfull-recording-context-${context.studyId}`));
  };

  constructor(getIframeBridgeState: () => InsightfullIframeBridgeState) {
    this.getIframeBridgeState = getIframeBridgeState;
    window.addEventListener("message", this.onMessage);
  }

  private getCurrentContext(studyId: number): RecordingContextMessage | null {
    const context = this.contexts.get(studyId);
    if (!context) {
      return null;
    }
    const registration =
      findIframeRegistration(this.getIframeBridgeState()) ??
      findIframeRegistrationFromContext(context);
    if (registration?.studyId === context.studyId && registration.nonce === context.nonce) {
      return context;
    }
    this.contexts.delete(studyId);
    return null;
  }

  destroy(): void {
    window.removeEventListener("message", this.onMessage);
  }

  async waitFor(
    studyId: number,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<RecordingContextMessage> {
    const existing = this.getCurrentContext(studyId);
    if (existing) {
      return existing;
    }
    return await new Promise<RecordingContextMessage>((resolve, reject) => {
      const eventName = `insightfull-recording-context-${studyId}`;
      const cleanup = (): void => {
        clearTimeout(timeout);
        window.removeEventListener(eventName, onContext);
        signal.removeEventListener("abort", onAbort);
      };
      const onAbort = (): void => {
        cleanup();
        reject(new Error("response_context_aborted"));
      };
      const onContext = (): void => {
        const context = this.getCurrentContext(studyId);
        if (!context) {
          return;
        }
        cleanup();
        resolve(context);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("response_context_timeout"));
      }, timeoutMs);
      window.addEventListener(eventName, onContext);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
    });
  }
}

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copied = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copied).set(bytes);
  return copied;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)));

const getEventTimestamp = (event: unknown): number | null => {
  if (!isRecord(event) || typeof event.timestamp !== "number") {
    return null;
  }
  return Number.isFinite(event.timestamp) ? event.timestamp : null;
};

const getChunkOffsets = (
  chunk: InsightfullRecordingChunk,
): { endOffsetMs: number; startOffsetMs: number } => {
  const timestamps = chunk.events
    .map(getEventTimestamp)
    .filter((timestamp): timestamp is number => timestamp !== null);
  const start = timestamps.length > 0 ? Math.min(...timestamps) : chunk.startedAt;
  const end = timestamps.length > 0 ? Math.max(...timestamps) : chunk.flushedAt;
  const startOffsetMs = Math.max(0, Math.round(start - chunk.startedAt));
  return {
    endOffsetMs: Math.max(startOffsetMs, Math.round(end - chunk.startedAt)),
    startOffsetMs,
  };
};

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

class RecordingError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("Recording is unavailable; the study can continue.");
    this.name = "RecordingError";
    this.code = code;
  }
}

export class RecordingAdapter {
  readonly recorderSdk: InsightfullRecorderCompatibleSDK;

  private readonly abortController = new AbortController();
  private readonly apiBase: string;
  private readonly coordinator: ResponseContextCoordinator;
  private readonly onStatusChange: ((status: RecordingAdapterStatus) => void) | undefined;
  private readonly responseContextTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly retryDelay: (milliseconds: number) => Promise<void>;
  private readonly sdk: InsightfullRecorderCompatibleSDK;
  private active: ActiveRecording | null = null;
  private createPromise: Promise<ActiveRecording> | null = null;
  private errorCode: string | null = null;
  private finalizePromise: Promise<void> | null = null;
  private messageChain: Promise<void> = Promise.resolve();
  private pendingStopReason = "recorder_stop";
  private status: RecordingAdapterStatus = "awaiting-response-context";
  private uploadChain: Promise<void> = Promise.resolve();
  private readonly totals: RecordingTotals = {
    bytes: 0,
    chunks: 0,
    events: 0,
    lastChunkSequence: 0,
  };

  private readonly onPageLifecycle = (): void => {
    this.pendingStopReason = "page_lifecycle";
  };

  constructor(sdk: InsightfullRecorderCompatibleSDK, options: RecordingAdapterOptions) {
    this.sdk = sdk;
    this.apiBase = options.apiBase.replace(TRAILING_SLASH, "");
    this.onStatusChange = options.onStatusChange;
    this.responseContextTimeoutMs = options.responseContextTimeoutMs ?? RESPONSE_CONTEXT_TIMEOUT_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.retryDelay =
      options.retryDelay ??
      ((milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)));
    this.coordinator = new ResponseContextCoordinator(() => this.sdk.getIframeBridgeState());
    this.recorderSdk = {
      getIframeBridgeState: () => this.sdk.getIframeBridgeState(),
      getRecorderContext: () => this.sdk.getRecorderContext(),
      sendIframeBridgeMessage: (message) => this.forwardRecorderMessage(message),
    };
    window.addEventListener("pagehide", this.onPageLifecycle);
    window.addEventListener("beforeunload", this.onPageLifecycle);
  }

  getRecordingSessionId(): string | null {
    return this.active?.recordingSessionId ?? null;
  }

  getErrorCode(): string | null {
    return this.errorCode;
  }

  getStatus(): RecordingAdapterStatus {
    return this.status;
  }

  async createSession(session: InsightfullRecordingSession): Promise<void> {
    if (this.createPromise) {
      await this.createPromise;
      return;
    }
    this.setStatus("awaiting-response-context");
    this.createPromise = this.createBackendSession(session);
    try {
      this.active = await this.createPromise;
      this.setStatus("recording");
    } catch (error) {
      this.degrade(error);
      throw error;
    }
  }

  uploadChunk(chunk: InsightfullRecordingChunk): Promise<void> {
    const upload = this.uploadChain.then(() => this.uploadChunkOnce(chunk));
    this.uploadChain = upload.catch(() => undefined);
    return upload;
  }

  async finalize(stopReason = "manual_stop", keepalive = false): Promise<void> {
    if (this.finalizePromise) {
      await this.finalizePromise;
      return;
    }
    this.finalizePromise = this.finalizeOnce(stopReason, keepalive);
    await this.finalizePromise;
  }

  destroy(): void {
    this.abortController.abort();
    this.coordinator.destroy();
    window.removeEventListener("pagehide", this.onPageLifecycle);
    window.removeEventListener("beforeunload", this.onPageLifecycle);
  }

  private async createBackendSession(
    session: InsightfullRecordingSession,
  ): Promise<ActiveRecording> {
    const context = await this.coordinator.waitFor(
      session.context.studyId,
      this.responseContextTimeoutMs,
      this.abortController.signal,
    );
    this.setStatus("creating-session");
    const response = await this.postTrpc<CreatedRecordingSession>(
      "realAppRecordings.createSession",
      {
        clientId: session.context.sdkEnvironmentId,
        origin: window.location.origin,
        privacy: { maskAllInputs: true, maskAllText: true },
        recorderVersion: "1.0.0",
        recordingFormatVersion: session.formatVersion,
        recordingSessionId: session.recordingSessionId,
        responseId: context.responseId,
        sdkVersion: "1.0.0",
        sectionResponseId: context.sectionResponseId ?? null,
        studyId: context.studyId,
        userId: session.context.userId,
        visitorId: session.context.visitorId,
      },
    );
    if (
      typeof response.capabilityToken !== "string" ||
      response.capabilityToken.length < 32 ||
      !isPositiveInteger(response.sdkEnvironmentId) ||
      response.recordingSessionId !== session.recordingSessionId
    ) {
      throw new RecordingError("invalid_create_response");
    }
    return {
      backend: response,
      recordingSessionId: session.recordingSessionId,
      startedAt: session.startedAt,
    };
  }

  private async uploadChunkOnce(chunk: InsightfullRecordingChunk): Promise<void> {
    try {
      const active = await this.requireActiveSession();
      this.totals.lastChunkSequence = Math.max(this.totals.lastChunkSequence, chunk.chunkIndex);
      const bytes = new TextEncoder().encode(JSON.stringify(chunk.events));
      const checksum = await sha256Hex(bytes);
      const offsets = getChunkOffsets(chunk);
      const response = await this.fetchWithRetry(`${this.binaryBase(active)}/chunks`, {
        body: toArrayBuffer(bytes),
        headers: this.binaryHeaders(active.backend.capabilityToken, checksum, {
          "Content-Type": "application/octet-stream",
          "X-Insightfull-End-Offset-Ms": String(offsets.endOffsetMs),
          "X-Insightfull-Event-Count": String(chunk.events.length),
          "X-Insightfull-Sequence": String(chunk.chunkIndex),
          "X-Insightfull-Start-Offset-Ms": String(offsets.startOffsetMs),
        }),
        method: "POST",
        signal: this.abortController.signal,
      });
      const stored = await this.parseStoredUpload(response, chunk.chunkIndex);
      this.totals.bytes += stored.byteSize;
      this.totals.chunks += 1;
      this.totals.events += chunk.events.length;
    } catch (error) {
      this.degrade(error);
      throw error;
    }
  }

  private forwardRecorderMessage(message: InsightfullIframeMessage): boolean {
    this.messageChain = this.messageChain
      .then(async () => {
        await this.requireActiveSession();
        const studyId =
          message.type === "insightfull.recording_session"
            ? message.context.studyId
            : this.sdk.getIframeBridgeState().studyId;
        if (!studyId) {
          throw new RecordingError("iframe_unavailable");
        }
        const context = await this.coordinator.waitFor(
          studyId,
          this.responseContextTimeoutMs,
          this.abortController.signal,
        );
        const enriched: InsightfullIframeMessage =
          message.type === "insightfull.recording_session"
            ? {
                ...message,
                context: {
                  ...message.context,
                  responseId: context.responseId,
                  ...(context.sectionResponseId
                    ? { sectionResponseId: context.sectionResponseId }
                    : {}),
                },
              }
            : message;
        this.sdk.sendIframeBridgeMessage(enriched);
        if (message.type === "insightfull.recording_session" && message.state === "stopped") {
          window.setTimeout(() => {
            this.finalize(
              this.pendingStopReason,
              this.pendingStopReason === "page_lifecycle",
            ).catch(() => undefined);
          }, 0);
        }
      })
      .catch((error) => this.degrade(error));
    return true;
  }

  private async finalizeOnce(stopReason: string, keepalive: boolean): Promise<void> {
    try {
      const active = await this.requireActiveSession();
      await this.messageChain;
      await this.uploadChain;
      this.setStatus("finalizing");
      const result = await this.postTrpc<{ status: "completed" | "partial" }>(
        "realAppRecordings.finalizeSession",
        {
          capabilityToken: active.backend.capabilityToken,
          endedAt: new Date().toISOString(),
          expectedFinalSequence: this.totals.lastChunkSequence,
          finalBytes: this.totals.bytes,
          finalChunkCount: this.totals.chunks,
          finalEventCount: this.totals.events,
          finalImageCount: 0,
          origin: window.location.origin,
          recordingSessionId: active.recordingSessionId,
          sdkEnvironmentId: active.backend.sdkEnvironmentId,
          stopReason,
        },
        keepalive,
      );
      if (!isRecord(result) || (result.status !== "completed" && result.status !== "partial")) {
        throw new RecordingError("invalid_finalize_response");
      }
      this.setStatus(this.errorCode ? "degraded" : result.status);
    } catch (error) {
      this.degrade(error);
      throw error;
    }
  }

  private async requireActiveSession(): Promise<ActiveRecording> {
    if (this.active) {
      return this.active;
    }
    if (this.createPromise) {
      return await this.createPromise;
    }
    throw new RecordingError("session_not_created");
  }

  private binaryBase(active: ActiveRecording): string {
    return `${this.apiBase}/api/real-app-recordings/v1/environments/${active.backend.sdkEnvironmentId}/sessions/${active.recordingSessionId}`;
  }

  private binaryHeaders(
    capabilityToken: string,
    checksum: string,
    headers: Record<string, string>,
  ): Headers {
    return new Headers({
      Authorization: `Bearer ${capabilityToken}`,
      "X-Insightfull-Checksum-Sha256": checksum,
      ...headers,
    });
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastStatus: number | null = null;
    for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        lastStatus = response.status;
        const accepted = this.acceptUploadResponse(response);
        if (accepted) {
          return accepted;
        }
      } catch (error) {
        if (
          this.abortController.signal.aborted ||
          (error instanceof RecordingError && error.code !== "request_timeout")
        ) {
          throw error;
        }
      }
      if (attempt < MAX_UPLOAD_ATTEMPTS - 1) {
        await this.retryDelay(RETRY_BASE_DELAY_MS * 2 ** attempt);
        if (this.abortController.signal.aborted) {
          throw new RecordingError("request_aborted");
        }
      }
    }
    throw new RecordingError(
      lastStatus === null ? "upload_network_failure" : "upload_retry_exhausted",
    );
  }

  private acceptUploadResponse(response: Response): Response | null {
    if (response.ok) {
      return response;
    }
    if (isRetryableStatus(response.status)) {
      return null;
    }
    throw new RecordingError(response.status === 409 ? "upload_conflict" : "upload_rejected");
  }

  private async parseStoredUpload(
    response: Response,
    expectedSequence: number,
  ): Promise<{ byteSize: number; sequence: number }> {
    const value: unknown = await response.json();
    if (
      !(isRecord(value) && isPositiveInteger(value.byteSize)) ||
      typeof value.sequence !== "number" ||
      !Number.isSafeInteger(value.sequence) ||
      value.sequence < 0 ||
      value.sequence !== expectedSequence
    ) {
      throw new RecordingError("invalid_upload_response");
    }
    return { byteSize: value.byteSize, sequence: value.sequence };
  }

  private async postTrpc<T = unknown>(
    procedure: string,
    input: Record<string, unknown>,
    keepalive = false,
  ): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.apiBase}/trpc/${procedure}`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      keepalive,
      method: "POST",
      signal: this.abortController.signal,
    });
    if (!response.ok) {
      throw new RecordingError(`${procedure}_failed`);
    }
    const envelope: unknown = await response.json();
    if (!isRecord(envelope)) {
      throw new RecordingError(`${procedure}_invalid_response`);
    }
    const typedEnvelope = envelope as TrpcEnvelope<T>;
    const data = typedEnvelope.result?.data;
    const result = isRecord(data) && "json" in data ? (data as { json: T }).json : (data as T);
    if (result === undefined) {
      throw new RecordingError(`${procedure}_invalid_response`);
    }
    return result;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const requestController = new AbortController();
    let timedOut = false;
    const abortRequest = (): void => requestController.abort();
    const sourceSignal = init.signal;
    this.abortController.signal.addEventListener("abort", abortRequest, { once: true });
    if (sourceSignal && sourceSignal !== this.abortController.signal) {
      sourceSignal.addEventListener("abort", abortRequest, { once: true });
    }
    const timeout = window.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, this.requestTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: requestController.signal });
    } catch (error) {
      if (timedOut) {
        throw new RecordingError("request_timeout");
      }
      if (
        this.abortController.signal.aborted ||
        sourceSignal?.aborted ||
        requestController.signal.aborted
      ) {
        throw new RecordingError("request_aborted");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      this.abortController.signal.removeEventListener("abort", abortRequest);
      if (sourceSignal && sourceSignal !== this.abortController.signal) {
        sourceSignal.removeEventListener("abort", abortRequest);
      }
    }
  }

  private setStatus(status: RecordingAdapterStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private degrade(error: unknown): void {
    this.errorCode = error instanceof RecordingError ? error.code : "recording_failure";
    this.setStatus("degraded");
  }
}
