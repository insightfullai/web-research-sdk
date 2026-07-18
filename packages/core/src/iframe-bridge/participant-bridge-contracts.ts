const HOST_CONTEXT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ROUTE_TEMPLATE_PATTERN = /^\/[A-Za-z0-9_/:.-]*$/;
const RECORDING_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_TIME_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const REAL_APP_ACTIVITY_EVIDENCE_V1_LIMITS = {
  maxCaptureOffsetMs: 30 * 60 * 1000,
  maxRageClickCount: 20,
  maxSerializedBytes: 512,
} as const;

interface RealAppActivityBase {
  captureOffsetMs: number;
  delivery: "prompted" | "silent";
  evidenceId: string;
  occurredAt: string;
  recordingSessionId: string;
  sequence: number;
  version: 1;
}

export type RealAppActivityEvidenceV1 = RealAppActivityBase &
  (
    | {
        facts: {
          kind: "navigation";
          routeTemplate?: string;
          surfaceId?: string;
        };
        kind: "navigation";
      }
    | { facts: { actionId?: string; kind: "click" }; kind: "click" }
    | { facts: { kind: "masked_field_change" }; kind: "masked_field_change" }
    | {
        facts: {
          actionId?: string;
          kind: "rage_click";
          minimumClickCount: number;
        };
        kind: "rage_click";
      }
    | {
        facts: { kind: "task_completion"; taskId?: string };
        kind: "task_completion";
      }
  );

export interface InsightfullRecordingContextMessage {
  nonce: string;
  responseId: number;
  sectionResponseId?: number;
  studyId: number;
  type: "insightfull.recording_context";
  version: 1;
}

export interface InsightfullRecordingActivityEvidenceMessage {
  evidence: RealAppActivityEvidenceV1;
  nonce: string;
  responseId: number;
  sectionResponseId?: number;
  studyId: number;
  type: "insightfull.recording_activity_evidence";
  version: 1;
}

export interface InsightfullResponseCompletedMessage {
  nonce: string;
  responseId: number;
  studyId: number;
  type: "insightfull.response_completed";
  version: 1;
}

export type InsightfullActivityEvidenceCallback = (
  message: InsightfullRecordingActivityEvidenceMessage,
) => void;
export type InsightfullResponseCompletedCallback = (
  message: InsightfullResponseCompletedMessage,
) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isBridgeIdentity = (value: Record<string, unknown>): boolean =>
  value.version === 1 &&
  typeof value.nonce === "string" &&
  value.nonce.length >= 16 &&
  value.nonce.length <= 256 &&
  isPositiveInteger(value.studyId) &&
  isPositiveInteger(value.responseId);

const isOptionalContextId = (value: unknown): value is string | undefined =>
  value === undefined || (typeof value === "string" && HOST_CONTEXT_ID_PATTERN.test(value));

const areBaseEvidenceFieldsValid = (value: Record<string, unknown>): boolean =>
  value.version === 1 &&
  typeof value.evidenceId === "string" &&
  UUID_PATTERN.test(value.evidenceId) &&
  typeof value.recordingSessionId === "string" &&
  RECORDING_SESSION_ID_PATTERN.test(value.recordingSessionId) &&
  typeof value.sequence === "number" &&
  Number.isSafeInteger(value.sequence) &&
  value.sequence >= 0 &&
  typeof value.occurredAt === "string" &&
  DATE_TIME_WITH_OFFSET_PATTERN.test(value.occurredAt) &&
  !Number.isNaN(Date.parse(value.occurredAt)) &&
  typeof value.captureOffsetMs === "number" &&
  Number.isSafeInteger(value.captureOffsetMs) &&
  value.captureOffsetMs >= 0 &&
  value.captureOffsetMs <= REAL_APP_ACTIVITY_EVIDENCE_V1_LIMITS.maxCaptureOffsetMs &&
  (value.delivery === "silent" || value.delivery === "prompted");

const areFactsValid = (kind: unknown, facts: unknown): boolean => {
  if (!isRecord(facts) || facts.kind !== kind) {
    return false;
  }
  if (kind === "navigation") {
    return (
      hasExactKeys(facts, ["kind"], ["surfaceId", "routeTemplate"]) &&
      isOptionalContextId(facts.surfaceId) &&
      (facts.routeTemplate === undefined ||
        (typeof facts.routeTemplate === "string" &&
          facts.routeTemplate.length <= 256 &&
          ROUTE_TEMPLATE_PATTERN.test(facts.routeTemplate)))
    );
  }
  if (kind === "click") {
    return hasExactKeys(facts, ["kind"], ["actionId"]) && isOptionalContextId(facts.actionId);
  }
  if (kind === "masked_field_change") {
    return hasExactKeys(facts, ["kind"]);
  }
  if (kind === "rage_click") {
    return (
      hasExactKeys(facts, ["kind", "minimumClickCount"], ["actionId"]) &&
      isOptionalContextId(facts.actionId) &&
      typeof facts.minimumClickCount === "number" &&
      Number.isInteger(facts.minimumClickCount) &&
      facts.minimumClickCount >= 2 &&
      facts.minimumClickCount <= REAL_APP_ACTIVITY_EVIDENCE_V1_LIMITS.maxRageClickCount
    );
  }
  if (kind === "task_completion") {
    return hasExactKeys(facts, ["kind"], ["taskId"]) && isOptionalContextId(facts.taskId);
  }
  return false;
};

const isActivityEvidence = (value: unknown): value is RealAppActivityEvidenceV1 => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "evidenceId",
      "recordingSessionId",
      "sequence",
      "occurredAt",
      "captureOffsetMs",
      "kind",
      "delivery",
      "facts",
    ]) ||
    !areBaseEvidenceFieldsValid(value) ||
    !areFactsValid(value.kind, value.facts)
  ) {
    return false;
  }
  return (
    new TextEncoder().encode(JSON.stringify(value)).byteLength <=
    REAL_APP_ACTIVITY_EVIDENCE_V1_LIMITS.maxSerializedBytes
  );
};

export const isRecordingContextMessage = (
  value: unknown,
): value is InsightfullRecordingContextMessage =>
  isRecord(value) &&
  hasExactKeys(
    value,
    ["version", "nonce", "studyId", "responseId", "type"],
    ["sectionResponseId"],
  ) &&
  value.type === "insightfull.recording_context" &&
  isBridgeIdentity(value) &&
  (value.sectionResponseId === undefined || isPositiveInteger(value.sectionResponseId));

export const isActivityEvidenceMessage = (
  value: unknown,
): value is InsightfullRecordingActivityEvidenceMessage =>
  isRecord(value) &&
  hasExactKeys(
    value,
    ["version", "nonce", "studyId", "responseId", "type", "evidence"],
    ["sectionResponseId"],
  ) &&
  value.type === "insightfull.recording_activity_evidence" &&
  isBridgeIdentity(value) &&
  (value.sectionResponseId === undefined || isPositiveInteger(value.sectionResponseId)) &&
  isActivityEvidence(value.evidence);

export const isResponseCompletedMessage = (
  value: unknown,
): value is InsightfullResponseCompletedMessage =>
  isRecord(value) &&
  hasExactKeys(value, ["version", "nonce", "studyId", "responseId", "type"]) &&
  value.type === "insightfull.response_completed" &&
  isBridgeIdentity(value);
