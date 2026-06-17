/**
 * Legacy bridge stubs — minimal type-only re-exports for v0.1 compatibility.
 *
 * These types existed in the v0.1 bridge-based SDK and are still referenced
 * by the React wrapper package. They are provided here as stubs so that
 * dependent packages continue to compile while they are migrated to v1.0.
 *
 * @deprecated These exports will be removed in a future major version.
 */

// ──── Types ────

/** Snapshot of the overlay bridge lifecycle state. */
export interface OverlayBridgeSnapshot {
  state: string;
  bridgeInstanceId?: string;
  [key: string]: unknown;
}

/** Parameters for receiveMessage. */
export interface ReceiveMessageOpts {
  origin: string;
  dispatch: (msg: AnyBridgeMessage) => void;
}

/** Parameters for beginHandshake. */
export interface BeginHandshakeOpts {
  dispatch: (msg: AnyBridgeMessage) => void;
}

/** Result of receiveMessage. */
export interface ReceiveMessageResult {
  accepted: boolean;
  duplicate: boolean;
  message?: AnyBridgeMessage;
}

/** Legacy web research client interface. */
export interface WebResearchClient {
  bridge: {
    getSnapshot(): OverlayBridgeSnapshot;
    subscribe(listener: (snapshot: OverlayBridgeSnapshot) => void): () => void;
    mount(): void;
    receiveMessage(data: unknown, opts: ReceiveMessageOpts): ReceiveMessageResult;
    beginHandshake(message: AnyBridgeMessage, opts: BeginHandshakeOpts): void;
    markIframeLoaded(): void;
    terminate(reason: string): void;
    getState(): string;
  };
  getSession(): { environment: string; sessionId: string };
  startBrowserSession(): BrowserSession;
  flush(reason: string): void;
  complete(reason: string): void;
  destroy(reason: string): void;
}

/** Legacy client options. */
export interface WebResearchClientOptions {
  environment?: string;
  sessionId?: string;
  bridge?: {
    iframeOrigin?: string;
    parentOrigin?: string;
    helloTimeoutMs?: number;
    readyTimeoutMs?: number;
    handshake?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/** Any bridge protocol message. */
export interface AnyBridgeMessage {
  type: string;
  messageId?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A browser session returned by startBrowserSession. */
export interface BrowserSession {
  sessionId: string;
  destroy(reason: string): void;
}

/** Batch of events sent via legacy transport. */
export interface WebResearchEventBatch {
  events: Array<{ name: string; [key: string]: unknown }>;
}

/** Completion payload for legacy transport. */
export interface WebResearchTransportCompletePayload {
  status: string;
}

/** Parameters for createBridgeMessageEnvelope. */
export interface CreateBridgeMessageEnvelopeParams {
  type: string;
  payload?: Record<string, unknown>;
  sessionId?: string;
  bridgeInstanceId?: unknown;
  sequence?: number;
  messageId?: string;
  sentAtMs?: number;
  overlayInstanceId?: string;
  correlationId?: unknown;
  [key: string]: unknown;
}

// ──── Stub factories ────

/** @deprecated Stub — use InsightfullSDK.init() instead. */
export function createWebResearchClient(_options?: WebResearchClientOptions): WebResearchClient {
  let state = "UNMOUNTED";
  const listeners = new Set<(snapshot: OverlayBridgeSnapshot) => void>();
  const snap = (): OverlayBridgeSnapshot => ({
    state,
    bridgeInstanceId: "stub-bridge",
  });

  return {
    bridge: {
      getSnapshot: snap,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      mount() {
        state = "IFRAME_LOADING";
        for (const l of listeners) l(snap());
      },
      receiveMessage(_data, _opts) {
        return { accepted: false, duplicate: false };
      },
      beginHandshake(_message, _opts) {
        state = "READY";
        for (const l of listeners) l(snap());
      },
      markIframeLoaded() {
        if (state === "IFRAME_LOADING") {
          state = "HANDSHAKE_PENDING";
          for (const l of listeners) l(snap());
        }
      },
      terminate(_reason) {
        state = "TERMINATED";
        for (const l of listeners) l(snap());
      },
      getState() {
        return state;
      },
    },
    getSession() {
      return {
        environment: "stub",
        sessionId: "00000000-0000-0000-0000-000000000000",
      };
    },
    startBrowserSession() {
      return {
        sessionId: "stub-browser-session",
        destroy(_reason: string) {
          /* noop */
        },
      };
    },
    flush(_reason: string) {
      /* noop */
    },
    complete(_reason: string) {
      /* noop */
    },
    destroy(_reason: string) {
      state = "TERMINATED";
      for (const l of listeners) l(snap());
    },
  };
}

/** @deprecated Stub. */
export function createBridgeMessageEnvelope(
  params: CreateBridgeMessageEnvelopeParams,
): AnyBridgeMessage {
  const result: AnyBridgeMessage = {
    type: params.type,
  };
  if (params.payload !== undefined) {
    result.payload = params.payload;
  }
  if (params.messageId !== undefined) {
    result.messageId = params.messageId;
  }
  return result;
}

/** @deprecated Stub. */
export function createCallbackTransport(_opts: {
  onBatch?: (batch: WebResearchEventBatch) => void;
  onComplete?: (payload: WebResearchTransportCompletePayload) => void;
}): unknown {
  throw new Error("createCallbackTransport is deprecated.");
}
