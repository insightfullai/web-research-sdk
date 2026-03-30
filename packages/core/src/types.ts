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
  apiKey: string;
  endpoint?: string;
  sessionId?: string;
  bridge?: WebResearchBridgeOptions;
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
  getLifecycleState: () => SdkLifecycleState;
  bridge: OverlayBridgeController;
  destroy: (reason?: string) => void;
}
