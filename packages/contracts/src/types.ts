import type {
  SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS,
  WEB_RESEARCH_ENVIRONMENTS,
  WEB_RESEARCH_EVENT_NAMES,
  WEB_RESEARCH_EVENT_SOURCES,
  WEB_RESEARCH_MESSAGE_TYPES,
  WEB_RESEARCH_TASK_SIGNAL_NAMES,
  WEB_RESEARCH_TASK_SIGNAL_STATUSES,
} from "./constants";

export type WebResearchProtocolVersion = (typeof SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS)[number];
export type WebResearchMessageType = (typeof WEB_RESEARCH_MESSAGE_TYPES)[number];
export type WebResearchEnvironment = (typeof WEB_RESEARCH_ENVIRONMENTS)[number];
export type WebResearchEventName = (typeof WEB_RESEARCH_EVENT_NAMES)[number];
export type WebResearchEventSource = (typeof WEB_RESEARCH_EVENT_SOURCES)[number];
export type WebResearchTaskSignalName = (typeof WEB_RESEARCH_TASK_SIGNAL_NAMES)[number];
export type WebResearchTaskSignalStatus = (typeof WEB_RESEARCH_TASK_SIGNAL_STATUSES)[number];

export type WebResearchDiagnosticCode =
  | "SCHEMA_ERROR"
  | "ORIGIN_MISMATCH"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_MESSAGE_TYPE";

export interface WebResearchSession {
  sessionId: string;
  startedAt: string;
  environment: WebResearchEnvironment;
}

export interface WebResearchHandshakeInitMessage {
  type: "insightfull:web-research-handshake:init";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
}

export interface WebResearchHandshakeReadyMessage {
  type: "insightfull:web-research-handshake:ready";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
}

export interface WebResearchEvent {
  id: string;
  name: WebResearchEventName;
  capturedAt: string;
  sessionId: string;
  source: WebResearchEventSource;
  payload: Record<string, unknown>;
}

export interface WebResearchBatchMessage {
  type: "insightfull:web-research-batch";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  reason: string;
  events: readonly WebResearchEvent[];
}

export interface WebResearchCompleteMessage {
  type: "insightfull:web-research-batch:complete";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  reason: string;
}

export interface WebResearchTaskCompleteSignalMessage {
  type: "insightfull:web-research-signal:task_complete";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  signal: "task_complete";
  status: "completed";
  taskId: string;
  evidence: {
    note?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface WebResearchTaskAbandonSignalMessage {
  type: "insightfull:web-research-signal:task_abandon";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  signal: "task_abandon";
  status: "abandoned";
  taskId: string;
  reason: string;
  evidence: {
    note?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface WebResearchDiagnosticMessage {
  type: "insightfull:web-research-diagnostic";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  code: WebResearchDiagnosticCode;
  detail?: string;
}

export interface WebResearchSessionErrorMessage {
  type: "insightfull:web-research-session:error";
  version: WebResearchProtocolVersion;
  session: WebResearchSession;
  sentAt: string;
  code: string;
  message: string;
  recoverable: boolean;
}

export type WebResearchTaskSignalMessage =
  | WebResearchTaskCompleteSignalMessage
  | WebResearchTaskAbandonSignalMessage;

export type WebResearchMessage =
  | WebResearchHandshakeInitMessage
  | WebResearchHandshakeReadyMessage
  | WebResearchBatchMessage
  | WebResearchCompleteMessage
  | WebResearchTaskSignalMessage
  | WebResearchDiagnosticMessage
  | WebResearchSessionErrorMessage;

export type WebResearchValidationCode =
  | "INVALID_PAYLOAD"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_MESSAGE_TYPE";

export interface WebResearchValidationIssue {
  code: WebResearchValidationCode;
  path: string;
  message: string;
}

export type WebResearchParseResult<TValue> =
  | { success: true; value: TValue }
  | { success: false; issues: readonly WebResearchValidationIssue[] };
