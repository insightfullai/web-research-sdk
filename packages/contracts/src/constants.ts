export const WEB_RESEARCH_PROTOCOL_VERSION = "1.0" as const;

export const SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS = [WEB_RESEARCH_PROTOCOL_VERSION] as const;

export const WEB_RESEARCH_MESSAGE_TYPES = [
  "insightfull:web-research-handshake:init",
  "insightfull:web-research-handshake:ready",
  "insightfull:web-research-batch",
  "insightfull:web-research-batch:complete",
  "insightfull:web-research-signal:task_complete",
  "insightfull:web-research-signal:task_abandon",
  "insightfull:web-research-diagnostic",
  "insightfull:web-research-session:error",
] as const;

export const WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[0];
export const WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[1];
export const WEB_RESEARCH_BATCH_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[2];
export const WEB_RESEARCH_COMPLETE_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[3];
export const WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[4];
export const WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[5];
export const WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[6];
export const WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE = WEB_RESEARCH_MESSAGE_TYPES[7];

export const WEB_RESEARCH_EVENT_NAMES = [
  "navigation",
  "dom.click",
  "dom.input",
  "dom.change",
  "dom.submit",
] as const;

export const WEB_RESEARCH_EVENT_SOURCES = ["browser", "manual"] as const;

export const WEB_RESEARCH_ENVIRONMENTS = ["dev", "staging", "prod"] as const;

export const WEB_RESEARCH_TASK_SIGNAL_NAMES = ["task_complete", "task_abandon"] as const;

export const WEB_RESEARCH_TASK_SIGNAL_STATUSES = ["completed", "abandoned"] as const;

export const WEB_RESEARCH_DIAGNOSTIC_CODES = [
  "SCHEMA_ERROR",
  "ORIGIN_MISMATCH",
  "UNSUPPORTED_VERSION",
  "UNKNOWN_MESSAGE_TYPE",
] as const;
