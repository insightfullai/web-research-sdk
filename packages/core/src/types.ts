import type {
  AnyBridgeMessage,
  BridgeCapability,
  BridgeErrorCode,
  BridgeMessage,
  BridgeMessagePayloadMap,
  BridgeMessageType,
  BridgeVersion,
  OverlayInitConsent,
  OverlayInitContext,
  OverlayInitUiConfig,
  RuntimeEnvironment,
  SessionMetadata,
  SdkEvent,
  SdkLifecycleState,
} from "./protocol";

export type {
  AnyBridgeMessage,
  BridgeCapability,
  BridgeErrorCode,
  BridgeMessage,
  BridgeMessagePayloadMap,
  BridgeMessageType,
  BridgeVersion,
  OverlayInitConsent,
  OverlayInitContext,
  OverlayInitUiConfig,
  RuntimeEnvironment,
  SessionMetadata,
  SdkEvent,
  SdkLifecycleState,
};

export interface BridgeRetryPolicyConfig {
  ackTimeoutMs?: number;
  maxRetries?: number;
  backoffMs?: readonly number[];
}

export interface BridgeOriginValidationInput {
  expectedOrigin: string;
  actualOrigin: string;
  allowedOrigins?: readonly string[];
}

export type BridgeOriginValidationResult =
  | { success: true; normalizedOrigin: string }
  | { success: false; code: "BRG_ORIGIN_MISMATCH"; reason: string };

export interface BridgeVersionSupportResult {
  requestedVersion: string;
  supportedVersions: readonly BridgeVersion[];
  isSupported: boolean;
}

export interface CreateBridgeMessageEnvelopeOptions<TType extends BridgeMessageType> {
  type: TType;
  payload: BridgeMessagePayloadMap[TType];
  sessionId: string;
  bridgeInstanceId: string;
  sequence: number;
  sentAtMs?: number;
  messageId?: string;
  overlayInstanceId?: string;
  correlationId?: string;
}

export type SdkToOverlayMessageType = Extract<
  BridgeMessageType,
  | "overlay:init"
  | "overlay:task_update"
  | "overlay:navigation_context"
  | "overlay:session_state"
  | "overlay:token_refresh"
  | "overlay:shutdown"
>;

export type OverlayToSdkMessageType = Extract<
  BridgeMessageType,
  | "overlay:hello"
  | "overlay:ready"
  | "overlay:ui_command"
  | "overlay:session_action"
  | "overlay:token_refresh_request"
  | "overlay:diagnostic"
  | "overlay:error"
  | "bridge:ack"
  | "bridge:nack"
  | "bridge:ping"
  | "bridge:pong"
>;

export interface OverlayBridgeHandshakeOptions {
  overlayToken: string;
  overlayTokenExpiresAt: string;
  context: OverlayInitContext;
  uiConfig: OverlayInitUiConfig;
  consent: OverlayInitConsent;
  authorizedCapabilities?: readonly BridgeCapability[];
}

export interface WebResearchBridgeOptions {
  iframeOrigin: string;
  parentOrigin?: string;
  supportedVersions?: readonly BridgeVersion[];
  supportedCapabilities?: readonly BridgeCapability[];
  retryPolicy?: BridgeRetryPolicyConfig;
  helloTimeoutMs?: number;
  readyTimeoutMs?: number;
  handshake?: OverlayBridgeHandshakeOptions;
}

export interface WebResearchClientOptions {
  environment: RuntimeEnvironment;
  /** @deprecated This field is unused and retained for compatibility only. */
  apiKey?: string;
  endpoint?: string;
  sessionId?: string;
  bridge?: WebResearchBridgeOptions;
  transport?: WebResearchTransport;
  batching?: WebResearchBatchingOptions;
}

export interface TrackedSdkEvent extends SdkEvent {
  id: string;
  sessionId: string;
  source: "manual" | "browser";
  capturedAt: string;
}

export interface WebResearchEventBatch {
  session: SessionMetadata;
  events: readonly TrackedSdkEvent[];
  reason: string;
}

export interface WebResearchTransportCompletePayload {
  session: SessionMetadata;
  reason: string;
  sentAt: string;
}

export interface WebResearchTransport {
  send: (batch: WebResearchEventBatch) => Promise<void> | void;
  complete?: (payload: WebResearchTransportCompletePayload) => Promise<void> | void;
}

export interface WebResearchBatchingOptions {
  batchSize?: number;
  flushIntervalMs?: number;
}

export interface StartBrowserSessionOptions {
  transport?: WebResearchTransport;
  batching?: WebResearchBatchingOptions;
  window?: Window;
  document?: Document;
  captureInitialNavigation?: boolean;
}

export interface BrowserSessionSnapshot {
  active: boolean;
  capturedEvents: number;
  bufferedEvents: number;
  lastFlushAt?: string;
}

export interface BrowserSessionController {
  start: () => void;
  flush: (reason?: string) => Promise<void>;
  complete: (reason?: string) => Promise<void>;
  destroy: (reason?: string) => Promise<void>;
  getSnapshot: () => BrowserSessionSnapshot;
}

export interface BridgeRuntimeDiagnostic {
  code: BridgeErrorCode | "BRG_DUPLICATE_MESSAGE" | "BRG_SEQUENCE_OUT_OF_ORDER";
  message: string;
  state: SdkLifecycleState;
  details?: Record<string, unknown>;
  timestampMs: number;
}

export interface OverlayBridgeSnapshot {
  state: SdkLifecycleState;
  bridgeInstanceId: string;
  sessionId: string;
  overlayInstanceId?: string;
  selectedVersion?: BridgeVersion;
  negotiatedCapabilities: readonly BridgeCapability[];
  lastSequenceBySender: Readonly<Record<string, number>>;
  pendingAckMessageIds: readonly string[];
  diagnostics: readonly BridgeRuntimeDiagnostic[];
}

export interface IncomingBridgeMessageContext {
  origin: string;
  dispatch?: (message: AnyBridgeMessage) => void;
}

export interface BridgeReceiveResult {
  accepted: boolean;
  duplicate: boolean;
  message?: AnyBridgeMessage;
  response?: BridgeMessage<"bridge:ack"> | BridgeMessage<"bridge:nack">;
  reason?: string;
}

export interface SendBridgeMessageOptions {
  dispatch?: (message: AnyBridgeMessage) => void;
  overlayInstanceId?: string;
  correlationId?: string;
  trackAck?: boolean;
  criticalOnFailure?: boolean;
}

export interface OverlayBridgeController {
  mount: () => void;
  markIframeLoaded: () => void;
  getState: () => SdkLifecycleState;
  getSnapshot: () => OverlayBridgeSnapshot;
  subscribe: (listener: (snapshot: OverlayBridgeSnapshot) => void) => () => void;
  sendMessage: <TType extends SdkToOverlayMessageType>(
    type: TType,
    payload: BridgeMessagePayloadMap[TType],
    options?: SendBridgeMessageOptions,
  ) => BridgeMessage<TType>;
  receiveMessage: (input: unknown, context: IncomingBridgeMessageContext) => BridgeReceiveResult;
  beginHandshake: (
    helloMessage: Extract<AnyBridgeMessage, { type: "overlay:hello" }>,
    options?: { dispatch?: (message: AnyBridgeMessage) => void },
  ) => BridgeMessage<"overlay:init">;
  terminate: (reason?: string) => void;
}

export interface WebResearchClient {
  getSession: () => SessionMetadata;
  track: (event: SdkEvent) => Promise<void>;
  flush: (reason?: string) => Promise<void>;
  complete: (reason?: string) => Promise<void>;
  startBrowserSession: (options?: StartBrowserSessionOptions) => BrowserSessionController;
  getLifecycleState: () => SdkLifecycleState;
  bridge: OverlayBridgeController;
  destroy: (reason?: string) => void;
}

export interface CallbackTransportOptions {
  onBatch: (batch: WebResearchEventBatch) => Promise<void> | void;
  onComplete?: (payload: WebResearchTransportCompletePayload) => Promise<void> | void;
}

export interface PostMessageTransportOptions {
  targetWindow: Pick<Window, "postMessage">;
  targetOrigin: string;
  messageType?: string;
}
