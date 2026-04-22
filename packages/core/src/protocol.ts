export const BRIDGE_NAMESPACE = "insightfull.overlay-bridge" as const;
export const BRIDGE_VERSION = "1.0" as const;

export const BRIDGE_CAPABILITIES = [
  "agent_audio",
  "agent_video",
  "pointer_passthrough",
  "task_prompts",
  "dynamic_overlay_resize",
  "token_refresh",
] as const;

export const SDK_LIFECYCLE_STATES = [
  "UNMOUNTED",
  "IFRAME_LOADING",
  "HANDSHAKE_PENDING",
  "READY",
  "DEGRADED",
  "TERMINATED",
] as const;

export const OVERLAY_LIFECYCLE_STATES = [
  "BOOTING",
  "HELLO_SENT",
  "INIT_RECEIVED",
  "READY",
  "RECOVERING",
  "CLOSED",
] as const;

export const BRIDGE_ERROR_CODES = [
  "BRG_ORIGIN_MISMATCH",
  "BRG_PROTOCOL_VERSION_UNSUPPORTED",
  "BRG_SCHEMA_INVALID",
  "BRG_UNKNOWN_MESSAGE_TYPE",
  "BRG_ACK_TIMEOUT",
  "BRG_OVERLAY_TOKEN_EXPIRED",
  "BRG_OVERLAY_TOKEN_INVALID",
  "BRG_IFRAME_UNAVAILABLE",
  "BRG_IFRAME_BLOCKED_BY_CSP",
  "BRG_COMMAND_NOT_ALLOWED",
  "BRG_RATE_LIMITED",
  "BRG_INTERNAL_ERROR",
] as const;

export const BRIDGE_MESSAGE_TYPES = [
  "overlay:init",
  "overlay:customization_update",
  "overlay:task_update",
  "overlay:navigation_context",
  "overlay:session_state",
  "overlay:token_refresh",
  "overlay:shutdown",
  "overlay:hello",
  "overlay:ready",
  "overlay:ui_command",
  "overlay:session_action",
  "overlay:token_refresh_request",
  "overlay:diagnostic",
  "overlay:error",
  "bridge:ack",
  "bridge:nack",
  "bridge:ping",
  "bridge:pong",
] as const;

export const BRIDGE_MESSAGE_SPECS = {
  "overlay:init": { direction: "sdk-to-overlay", requiresAck: true },
  "overlay:customization_update": {
    direction: "sdk-to-overlay",
    requiresAck: true,
  },
  "overlay:task_update": { direction: "sdk-to-overlay", requiresAck: true },
  "overlay:navigation_context": {
    direction: "sdk-to-overlay",
    requiresAck: false,
  },
  "overlay:session_state": { direction: "sdk-to-overlay", requiresAck: true },
  "overlay:token_refresh": { direction: "sdk-to-overlay", requiresAck: true },
  "overlay:shutdown": { direction: "sdk-to-overlay", requiresAck: true },
  "overlay:hello": { direction: "overlay-to-sdk", requiresAck: true },
  "overlay:ready": { direction: "overlay-to-sdk", requiresAck: true },
  "overlay:ui_command": { direction: "overlay-to-sdk", requiresAck: true },
  "overlay:session_action": { direction: "overlay-to-sdk", requiresAck: true },
  "overlay:token_refresh_request": {
    direction: "overlay-to-sdk",
    requiresAck: true,
  },
  "overlay:diagnostic": { direction: "overlay-to-sdk", requiresAck: false },
  "overlay:error": { direction: "overlay-to-sdk", requiresAck: false },
  "bridge:ack": { direction: "generic", requiresAck: false },
  "bridge:nack": { direction: "generic", requiresAck: false },
  "bridge:ping": { direction: "generic", requiresAck: false },
  "bridge:pong": { direction: "generic", requiresAck: false },
} as const;

export const BRIDGE_RETRY_POLICY = {
  ackTimeoutMs: 1500,
  maxRetries: 2,
  backoffMs: [300, 800] as const,
} as const;

export const RUNTIME_ENVIRONMENTS = ["dev", "staging", "prod"] as const;

export type BridgeNamespace = typeof BRIDGE_NAMESPACE;
export type BridgeVersion = typeof BRIDGE_VERSION;
export type BridgeCapability = (typeof BRIDGE_CAPABILITIES)[number];
export type SdkLifecycleState = (typeof SDK_LIFECYCLE_STATES)[number];
export type OverlayLifecycleState = (typeof OVERLAY_LIFECYCLE_STATES)[number];
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];
export type BridgeMessageType = (typeof BRIDGE_MESSAGE_TYPES)[number];
export type BridgeMessageDirection = (typeof BRIDGE_MESSAGE_SPECS)[BridgeMessageType]["direction"];
export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

export type OverlayTaskStatus = "pending" | "active" | "completed" | "abandoned";
export type OverlayRouteType = "history" | "hash" | "full_reload";
export type OverlaySessionState = "active" | "paused" | "ending" | "ended" | "degraded";
export type OverlayShutdownReason =
  | "session_ended"
  | "security_violation"
  | "manual_teardown"
  | "fatal_error";
export type OverlayUiPosition = "bottom-right" | "bottom-left";
export type OverlayTheme = "light" | "dark" | "system";
export type OverlayPersonaVariant = "obsidian" | "mana" | "opal" | "halo" | "glint" | "command";
export type OverlayConsentMode = "required" | "best_effort" | "off";
export type OverlayUiCommand =
  | "request_minimize"
  | "request_expand"
  | "set_pointer_passthrough"
  | "focus_overlay"
  | "set_overlay_size_hint";
export type OverlaySessionAction =
  | "end_session"
  | "pause_capture"
  | "resume_capture"
  | "task_complete"
  | "task_abandon";
export type OverlayTokenRefreshRequestReason = "expiring" | "backend_reconnect";
export type BridgeDiagnosticLevel = "info" | "warn" | "error";

export interface SessionMetadata {
  sessionId: string;
  startedAt: string;
  environment: RuntimeEnvironment;
}

export interface SdkEvent {
  name: string;
  payload: Record<string, unknown>;
}

export interface BridgeEnvelope<TType extends BridgeMessageType, TPayload> {
  namespace: BridgeNamespace;
  version: BridgeVersion;
  type: TType;
  messageId: string;
  sequence: number;
  sentAtMs: number;
  sessionId: string;
  bridgeInstanceId: string;
  overlayInstanceId?: string;
  correlationId?: string;
  requiresAck?: boolean;
  payload: TPayload;
}

export interface OverlayInitContext {
  organizationId: number;
  studyId: number;
  sectionId: number;
  sessionId: string;
  participantId?: string;
  tabId: string;
}

export interface OverlayInitUiConfig {
  defaultPosition: OverlayUiPosition;
  showAiPersona: boolean;
  theme?: OverlayTheme;
  customization?: OverlayCustomization;
}

export interface OverlayTypographyConfig {
  fontFamily?: string | null;
  headingFontFamily?: string | null;
}

export interface OverlayTailwindThemeOverrides {
  primary?: string | null;
  primaryForeground?: string | null;
  secondary?: string | null;
  secondaryForeground?: string | null;
  accent?: string | null;
  accentForeground?: string | null;
  background?: string | null;
  foreground?: string | null;
  muted?: string | null;
  mutedForeground?: string | null;
  border?: string | null;
  ring?: string | null;
  radius?: string | null;
  fontFamily?: string | null;
  headingFontFamily?: string | null;
}

export interface OverlayCustomization {
  persona?: OverlayPersonaVariant;
  typography?: OverlayTypographyConfig;
  tailwindTheme?: OverlayTailwindThemeOverrides;
}

export interface OverlayInitConsent {
  mode: OverlayConsentMode;
  captureAllowed: boolean;
}

export interface OverlayInitPayload {
  selectedVersion: BridgeVersion;
  parentOrigin: string;
  overlayToken: string;
  overlayTokenExpiresAt: string;
  selectedCapabilities: BridgeCapability[];
  context: OverlayInitContext;
  uiConfig: OverlayInitUiConfig;
  consent: OverlayInitConsent;
}

export interface OverlayTask {
  id: string;
  status: OverlayTaskStatus;
  instruction: string;
  maxDurationSeconds?: number;
}

export interface OverlayTaskUpdatePayload {
  activeTaskId: string | null;
  tasks: OverlayTask[];
}

export interface OverlayCustomizationUpdatePayload {
  customization: OverlayCustomization;
}

export interface OverlayNavigationContextPayload {
  pageUrl: string;
  pagePath: string;
  routeType: OverlayRouteType;
  timestampMs: number;
}

export interface OverlaySessionStatePayload {
  state: OverlaySessionState;
  reason?: string;
}

export interface OverlayTokenRefreshPayload {
  overlayToken: string;
  overlayTokenExpiresAt: string;
}

export interface OverlayShutdownPayload {
  reason: OverlayShutdownReason;
}

export interface OverlayHelloPayload {
  overlayInstanceId: string;
  supportedVersions: BridgeVersion[];
  capabilities: BridgeCapability[];
  overlayBuild: string;
}

export interface OverlayReadyPayload {
  overlayInstanceId: string;
  acceptedCapabilities: BridgeCapability[];
  media: {
    audioReady: boolean;
    videoReady: boolean;
  };
}

export interface OverlayUiCommandPayload {
  command: OverlayUiCommand;
  args?: Record<string, unknown>;
}

export interface OverlaySessionActionPayload {
  action: OverlaySessionAction;
  taskId?: string;
  reason?: string;
}

export interface OverlayTokenRefreshRequestPayload {
  reason: OverlayTokenRefreshRequestReason;
  expiresAt: string;
}

export interface BridgeDiagnosticPayload {
  level: BridgeDiagnosticLevel;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BridgeErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
  fatal: boolean;
}

export interface BridgeAckPayload {
  ackMessageId: string;
  status: "ok";
}

export interface BridgeNackPayload {
  ackMessageId: string;
  status: "rejected";
  code: string;
  message: string;
  retryable: boolean;
}

export type BridgePingPayload = Record<string, never>;
export type BridgePongPayload = Record<string, never>;

export interface BridgeMessagePayloadMap {
  "overlay:init": OverlayInitPayload;
  "overlay:customization_update": OverlayCustomizationUpdatePayload;
  "overlay:task_update": OverlayTaskUpdatePayload;
  "overlay:navigation_context": OverlayNavigationContextPayload;
  "overlay:session_state": OverlaySessionStatePayload;
  "overlay:token_refresh": OverlayTokenRefreshPayload;
  "overlay:shutdown": OverlayShutdownPayload;
  "overlay:hello": OverlayHelloPayload;
  "overlay:ready": OverlayReadyPayload;
  "overlay:ui_command": OverlayUiCommandPayload;
  "overlay:session_action": OverlaySessionActionPayload;
  "overlay:token_refresh_request": OverlayTokenRefreshRequestPayload;
  "overlay:diagnostic": BridgeDiagnosticPayload;
  "overlay:error": BridgeErrorPayload;
  "bridge:ack": BridgeAckPayload;
  "bridge:nack": BridgeNackPayload;
  "bridge:ping": BridgePingPayload;
  "bridge:pong": BridgePongPayload;
}

export type BridgeMessage<TType extends BridgeMessageType> = BridgeEnvelope<
  TType,
  BridgeMessagePayloadMap[TType]
>;

export type AnyBridgeMessage = {
  [TType in BridgeMessageType]: BridgeMessage<TType>;
}[BridgeMessageType];

export interface BridgeValidationIssue {
  code: BridgeErrorCode;
  message: string;
  path: string;
}

export interface BridgeValidationError {
  code: BridgeErrorCode;
  message: string;
  issues: BridgeValidationIssue[];
}

export type BridgeValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: BridgeValidationError };
