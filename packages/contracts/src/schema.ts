import {
  SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS,
  WEB_RESEARCH_BATCH_MESSAGE_TYPE,
  WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE,
  WEB_RESEARCH_DIAGNOSTIC_CODES,
  WEB_RESEARCH_ENVIRONMENTS,
  WEB_RESEARCH_EVENT_NAMES,
  WEB_RESEARCH_EVENT_SOURCES,
  WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
  WEB_RESEARCH_MESSAGE_TYPES,
  WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_SIGNAL_STATUSES,
} from "./constants";
import type {
  WebResearchBatchMessage,
  WebResearchCompleteMessage,
  WebResearchDiagnosticMessage,
  WebResearchEvent,
  WebResearchHandshakeInitMessage,
  WebResearchHandshakeReadyMessage,
  WebResearchMessage,
  WebResearchParseResult,
  WebResearchSession,
  WebResearchSessionErrorMessage,
  WebResearchTaskAbandonSignalMessage,
  WebResearchTaskCompleteSignalMessage,
  WebResearchValidationCode,
  WebResearchValidationIssue,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const MESSAGE_TYPE_SET = new Set<string>(WEB_RESEARCH_MESSAGE_TYPES);
const EVENT_NAME_SET = new Set<string>(WEB_RESEARCH_EVENT_NAMES);
const EVENT_SOURCE_SET = new Set<string>(WEB_RESEARCH_EVENT_SOURCES);
const ENVIRONMENT_SET = new Set<string>(WEB_RESEARCH_ENVIRONMENTS);
const SUPPORTED_VERSION_SET = new Set<string>(SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS);
const TASK_SIGNAL_STATUS_SET = new Set<string>(WEB_RESEARCH_TASK_SIGNAL_STATUSES);
const DIAGNOSTIC_CODE_SET = new Set<string>(WEB_RESEARCH_DIAGNOSTIC_CODES);

const MAX_EVENT_PAYLOAD_DEPTH = 5;
const MAX_EVENT_PAYLOAD_SIZE_BYTES = 10240;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushIssue(
  issues: WebResearchValidationIssue[],
  code: WebResearchValidationCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function validateIsoDateString(
  value: unknown,
  path: string,
  issues: WebResearchValidationIssue[],
): value is string {
  if (!isNonEmptyString(value)) {
    pushIssue(issues, "INVALID_PAYLOAD", path, "Expected non-empty ISO date string");
    return false;
  }

  if (Number.isNaN(Date.parse(value))) {
    pushIssue(issues, "INVALID_PAYLOAD", path, "Expected parseable ISO date string");
    return false;
  }

  return true;
}

function validateVersion(
  value: unknown,
  path: string,
  issues: WebResearchValidationIssue[],
): value is string {
  if (!isNonEmptyString(value)) {
    pushIssue(issues, "UNSUPPORTED_VERSION", path, "Protocol version is required");
    return false;
  }

  if (!SUPPORTED_VERSION_SET.has(value)) {
    pushIssue(
      issues,
      "UNSUPPORTED_VERSION",
      path,
      `Unsupported protocol version "${value}". Supported versions: ${SUPPORTED_WEB_RESEARCH_PROTOCOL_VERSIONS.join(", ")}`,
    );
    return false;
  }

  return true;
}

function validateMessageType(
  value: unknown,
  path: string,
  issues: WebResearchValidationIssue[],
): value is WebResearchMessage["type"] {
  if (!isNonEmptyString(value) || !MESSAGE_TYPE_SET.has(value)) {
    pushIssue(
      issues,
      "UNKNOWN_MESSAGE_TYPE",
      path,
      `Expected one of: ${WEB_RESEARCH_MESSAGE_TYPES.join(", ")}`,
    );
    return false;
  }

  return true;
}

function validateEnvelope(
  input: unknown,
  expectedType: string,
  issues: WebResearchValidationIssue[],
): { version: string; session: WebResearchSession; sentAt: string } | null {
  if (!isRecord(input)) {
    pushIssue(issues, "INVALID_PAYLOAD", "message", "Expected object");
    return null;
  }

  let valid = true;
  valid = validateVersion(input.version, "version", issues) && valid;

  if (input.type !== expectedType) {
    pushIssue(issues, "UNKNOWN_MESSAGE_TYPE", "type", `Expected ${expectedType}`);
    valid = false;
  }

  const session = validateWebResearchSession(input.session);
  if (!session.success) {
    issues.push(...session.issues);
    valid = false;
  }

  valid = validateIsoDateString(input.sentAt, "sentAt", issues) && valid;

  if (!valid || !session.success) {
    return null;
  }

  return {
    version: input.version as string,
    session: session.value,
    sentAt: input.sentAt as string,
  };
}

export function validateWebResearchSession(
  input: unknown,
): WebResearchParseResult<WebResearchSession> {
  const issues: WebResearchValidationIssue[] = [];
  if (!isRecord(input)) {
    pushIssue(issues, "INVALID_PAYLOAD", "session", "Expected object");
    return { success: false, issues };
  }

  let valid = true;

  if (!isNonEmptyString(input.sessionId)) {
    pushIssue(issues, "INVALID_PAYLOAD", "session.sessionId", "Expected non-empty string");
    valid = false;
  }

  valid = validateIsoDateString(input.startedAt, "session.startedAt", issues) && valid;

  if (!isNonEmptyString(input.environment) || !ENVIRONMENT_SET.has(input.environment)) {
    pushIssue(
      issues,
      "INVALID_PAYLOAD",
      "session.environment",
      `Expected one of: ${WEB_RESEARCH_ENVIRONMENTS.join(", ")}`,
    );
    valid = false;
  }

  if (!valid) {
    return { success: false, issues };
  }

  return {
    success: true,
    value: {
      sessionId: input.sessionId as string,
      startedAt: input.startedAt as string,
      environment: input.environment as WebResearchSession["environment"],
    },
  };
}

function validateWebResearchEvent(
  input: unknown,
  path: string,
  issues: WebResearchValidationIssue[],
): boolean {
  if (!isRecord(input)) {
    pushIssue(issues, "INVALID_PAYLOAD", path, "Expected object");
    return false;
  }

  let valid = true;

  if (!isNonEmptyString(input.id)) {
    pushIssue(issues, "INVALID_PAYLOAD", `${path}.id`, "Expected non-empty string");
    valid = false;
  }

  if (!isNonEmptyString(input.name) || !EVENT_NAME_SET.has(input.name)) {
    pushIssue(
      issues,
      "INVALID_PAYLOAD",
      `${path}.name`,
      `Expected one of: ${WEB_RESEARCH_EVENT_NAMES.join(", ")}`,
    );
    valid = false;
  }

  valid = validateIsoDateString(input.capturedAt, `${path}.capturedAt`, issues) && valid;

  if (!isNonEmptyString(input.sessionId)) {
    pushIssue(issues, "INVALID_PAYLOAD", `${path}.sessionId`, "Expected non-empty string");
    valid = false;
  }

  if (!isNonEmptyString(input.source) || !EVENT_SOURCE_SET.has(input.source)) {
    pushIssue(
      issues,
      "INVALID_PAYLOAD",
      `${path}.source`,
      `Expected one of: ${WEB_RESEARCH_EVENT_SOURCES.join(", ")}`,
    );
    valid = false;
  }

  if (!isRecord(input.payload)) {
    pushIssue(issues, "INVALID_PAYLOAD", `${path}.payload`, "Expected object");
    valid = false;
  }

  if (isRecord(input.payload)) {
    valid = validatePayloadDepth(input.payload, MAX_EVENT_PAYLOAD_DEPTH, 1, `${path}.payload`, issues) && valid;

    if (JSON.stringify(input.payload).length > MAX_EVENT_PAYLOAD_SIZE_BYTES) {
      pushIssue(
        issues,
        "INVALID_PAYLOAD",
        `${path}.payload`,
        `Payload size exceeds maximum of ${MAX_EVENT_PAYLOAD_SIZE_BYTES} bytes`,
      );
      valid = false;
    }
  }

  return valid;
}

function validatePayloadDepth(
  value: unknown,
  maxDepth: number,
  currentDepth: number,
  path: string,
  issues: WebResearchValidationIssue[],
): boolean {
  if (currentDepth > maxDepth) {
    pushIssue(issues, "INVALID_PAYLOAD", path, `Payload depth exceeds maximum of ${maxDepth}`);
    return false;
  }

  if (isRecord(value)) {
    let valid = true;
    for (const key of Object.keys(value)) {
      valid = validatePayloadDepth(value[key], maxDepth, currentDepth + 1, `${path}.${key}`, issues) && valid;
    }
    return valid;
  }

  if (Array.isArray(value)) {
    let valid = true;
    for (let i = 0; i < value.length; i++) {
      valid = validatePayloadDepth(value[i], maxDepth, currentDepth + 1, `${path}[${i}]`, issues) && valid;
    }
    return valid;
  }

  return true;
}

export function validateWebResearchBatchMessage(
  input: unknown,
): WebResearchParseResult<WebResearchBatchMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_BATCH_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  let valid = true;

  if (!isNonEmptyString(input.reason)) {
    pushIssue(issues, "INVALID_PAYLOAD", "reason", "Expected non-empty string");
    valid = false;
  }

  if (!Array.isArray(input.events)) {
    pushIssue(issues, "INVALID_PAYLOAD", "events", "Expected array");
    valid = false;
  } else {
    input.events.forEach((event, index) => {
      valid = validateWebResearchEvent(event, `events[${index}]`, issues) && valid;
    });
  }

  if (!valid) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_BATCH_MESSAGE_TYPE,
      version: envelope.version as WebResearchBatchMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      reason: input.reason as string,
      events: input.events as WebResearchEvent[],
    },
  };
}

export function validateWebResearchHandshakeInitMessage(
  input: unknown,
): WebResearchParseResult<WebResearchHandshakeInitMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
      version: envelope.version as WebResearchHandshakeInitMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
    },
  };
}

export function validateWebResearchHandshakeReadyMessage(
  input: unknown,
): WebResearchParseResult<WebResearchHandshakeReadyMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
      version: envelope.version as WebResearchHandshakeReadyMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
    },
  };
}

export function validateWebResearchCompleteMessage(
  input: unknown,
): WebResearchParseResult<WebResearchCompleteMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_COMPLETE_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  if (!isNonEmptyString(input.reason)) {
    pushIssue(issues, "INVALID_PAYLOAD", "reason", "Expected non-empty string");
    return { success: false, issues };
  }

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
      version: envelope.version as WebResearchCompleteMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      reason: input.reason as string,
    },
  };
}

function validateSignalEvidence(
  input: unknown,
  path: string,
  issues: WebResearchValidationIssue[],
): input is { note?: string; metadata?: Record<string, unknown> } {
  if (!isRecord(input)) {
    pushIssue(issues, "INVALID_PAYLOAD", path, "Expected object");
    return false;
  }

  let valid = true;
  if (input.note !== undefined && !isNonEmptyString(input.note)) {
    pushIssue(issues, "INVALID_PAYLOAD", `${path}.note`, "Expected non-empty string");
    valid = false;
  }

  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    pushIssue(issues, "INVALID_PAYLOAD", `${path}.metadata`, "Expected object");
    valid = false;
  }

  return valid;
}

function validateSignalStatus(
  value: unknown,
  expectedStatus: "completed" | "abandoned",
  path: string,
  issues: WebResearchValidationIssue[],
): value is "completed" | "abandoned" {
  if (!isNonEmptyString(value) || !TASK_SIGNAL_STATUS_SET.has(value)) {
    pushIssue(
      issues,
      "INVALID_PAYLOAD",
      path,
      `Expected one of: ${WEB_RESEARCH_TASK_SIGNAL_STATUSES.join(", ")}`,
    );
    return false;
  }

  if (value !== expectedStatus) {
    pushIssue(issues, "INVALID_PAYLOAD", path, `Expected "${expectedStatus}"`);
    return false;
  }

  return true;
}

export function validateWebResearchTaskCompleteSignalMessage(
  input: unknown,
): WebResearchParseResult<WebResearchTaskCompleteSignalMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  let valid = true;

  if (input.signal !== "task_complete") {
    pushIssue(issues, "INVALID_PAYLOAD", "signal", 'Expected "task_complete"');
    valid = false;
  }

  valid = validateSignalStatus(input.status, "completed", "status", issues) && valid;

  if (!isNonEmptyString(input.taskId)) {
    pushIssue(issues, "INVALID_PAYLOAD", "taskId", "Expected non-empty string");
    valid = false;
  }

  valid = validateSignalEvidence(input.evidence, "evidence", issues) && valid;

  if (!valid) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
      version: envelope.version as WebResearchTaskCompleteSignalMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      signal: "task_complete",
      status: "completed",
      taskId: input.taskId as string,
      evidence: input.evidence as WebResearchTaskCompleteSignalMessage["evidence"],
    },
  };
}

export function validateWebResearchTaskAbandonSignalMessage(
  input: unknown,
): WebResearchParseResult<WebResearchTaskAbandonSignalMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  let valid = true;

  if (input.signal !== "task_abandon") {
    pushIssue(issues, "INVALID_PAYLOAD", "signal", 'Expected "task_abandon"');
    valid = false;
  }

  valid = validateSignalStatus(input.status, "abandoned", "status", issues) && valid;

  if (!isNonEmptyString(input.taskId)) {
    pushIssue(issues, "INVALID_PAYLOAD", "taskId", "Expected non-empty string");
    valid = false;
  }

  if (!isNonEmptyString(input.reason)) {
    pushIssue(issues, "INVALID_PAYLOAD", "reason", "Expected non-empty string");
    valid = false;
  }

  valid = validateSignalEvidence(input.evidence, "evidence", issues) && valid;

  if (!valid) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
      version: envelope.version as WebResearchTaskAbandonSignalMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      signal: "task_abandon",
      status: "abandoned",
      taskId: input.taskId as string,
      reason: input.reason as string,
      evidence: input.evidence as WebResearchTaskAbandonSignalMessage["evidence"],
    },
  };
}

export function validateWebResearchDiagnosticMessage(
  input: unknown,
): WebResearchParseResult<WebResearchDiagnosticMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  if (!isNonEmptyString(input.code) || !DIAGNOSTIC_CODE_SET.has(input.code)) {
    pushIssue(
      issues,
      "INVALID_PAYLOAD",
      "code",
      `Expected one of: ${WEB_RESEARCH_DIAGNOSTIC_CODES.join(", ")}`,
    );
    return { success: false, issues };
  }

  if (input.detail !== undefined && !isNonEmptyString(input.detail)) {
    pushIssue(issues, "INVALID_PAYLOAD", "detail", "Expected non-empty string");
    return { success: false, issues };
  }

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE,
      version: envelope.version as WebResearchDiagnosticMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      code: input.code as WebResearchDiagnosticMessage["code"],
      detail: input.detail as string | undefined,
    },
  };
}

export function validateWebResearchSessionErrorMessage(
  input: unknown,
): WebResearchParseResult<WebResearchSessionErrorMessage> {
  const issues: WebResearchValidationIssue[] = [];
  const envelope = validateEnvelope(input, WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE, issues);
  if (!envelope) return { success: false, issues };

  if (!isRecord(input)) return { success: false, issues };

  let valid = true;

  if (!isNonEmptyString(input.code)) {
    pushIssue(issues, "INVALID_PAYLOAD", "code", "Expected non-empty string");
    valid = false;
  }

  if (!isNonEmptyString(input.message)) {
    pushIssue(issues, "INVALID_PAYLOAD", "message", "Expected non-empty string");
    valid = false;
  }

  if (typeof input.recoverable !== "boolean") {
    pushIssue(issues, "INVALID_PAYLOAD", "recoverable", "Expected boolean");
    valid = false;
  }

  if (!valid) return { success: false, issues };

  return {
    success: true,
    value: {
      type: WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE,
      version: envelope.version as WebResearchSessionErrorMessage["version"],
      session: envelope.session,
      sentAt: envelope.sentAt,
      code: input.code as string,
      message: input.message as string,
      recoverable: input.recoverable as boolean,
    },
  };
}

export function validateWebResearchMessage(
  input: unknown,
): WebResearchParseResult<WebResearchMessage> {
  const issues: WebResearchValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "INVALID_PAYLOAD", "message", "Expected object");
    return { success: false, issues };
  }

  if (!validateMessageType(input.type, "type", issues)) {
    return { success: false, issues };
  }

  switch (input.type) {
    case WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE:
      return validateWebResearchHandshakeInitMessage(input);
    case WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE:
      return validateWebResearchHandshakeReadyMessage(input);
    case WEB_RESEARCH_BATCH_MESSAGE_TYPE:
      return validateWebResearchBatchMessage(input);
    case WEB_RESEARCH_COMPLETE_MESSAGE_TYPE:
      return validateWebResearchCompleteMessage(input);
    case WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE:
      return validateWebResearchTaskCompleteSignalMessage(input);
    case WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE:
      return validateWebResearchTaskAbandonSignalMessage(input);
    case WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE:
      return validateWebResearchDiagnosticMessage(input);
    case WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE:
      return validateWebResearchSessionErrorMessage(input);
    default:
      return { success: false, issues };
  }
}
