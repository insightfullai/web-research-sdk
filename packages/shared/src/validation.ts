import {
  BRIDGE_CAPABILITIES,
  BRIDGE_ERROR_CODES,
  BRIDGE_MESSAGE_SPECS,
  BRIDGE_MESSAGE_TYPES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  type AnyBridgeMessage,
  type BridgeCapability,
  type BridgeErrorCode,
  type BridgeMessageType,
  type BridgeValidationIssue,
  type BridgeValidationResult,
} from "./protocol";

type UnknownRecord = Record<string, unknown>;

const CAPABILITY_SET = new Set<string>(BRIDGE_CAPABILITIES);
const MESSAGE_TYPE_SET = new Set<string>(BRIDGE_MESSAGE_TYPES);
const ERROR_CODE_SET = new Set<string>(BRIDGE_ERROR_CODES);
const OVERLAY_PERSONA_VARIANTS = ["obsidian", "mana", "opal", "halo", "glint", "command"];
const OVERLAY_TYPOGRAPHY_KEYS = ["fontFamily", "headingFontFamily"] as const;
const OVERLAY_TAILWIND_THEME_KEYS = [
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "accent",
  "accentForeground",
  "background",
  "foreground",
  "muted",
  "mutedForeground",
  "border",
  "ring",
  "radius",
  "fontFamily",
  "headingFontFamily",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isKnownCapability(value: unknown): value is BridgeCapability {
  return typeof value === "string" && CAPABILITY_SET.has(value);
}

function pushIssue(
  issues: BridgeValidationIssue[],
  code: BridgeErrorCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function validateString(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is string {
  if (!isNonEmptyString(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected non-empty string");
    return false;
  }

  return true;
}

function validateNumber(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is number {
  if (!isFiniteNumber(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected finite number");
    return false;
  }

  return true;
}

function validateBoolean(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is boolean {
  if (!isBoolean(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected boolean");
    return false;
  }

  return true;
}

function validateStringOrNull(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is string | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "string") {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected string or null");
    return false;
  }

  return true;
}

function validateEnum<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  path: string,
  issues: BridgeValidationIssue[],
): value is TValue {
  if (typeof value !== "string" || !allowedValues.includes(value as TValue)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, `Expected one of: ${allowedValues.join(", ")}`);
    return false;
  }

  return true;
}

function validateCapabilityArray(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is BridgeCapability[] {
  if (!Array.isArray(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected array");
    return false;
  }

  let valid = true;
  value.forEach((entry, index) => {
    if (!isKnownCapability(entry)) {
      pushIssue(
        issues,
        "BRG_SCHEMA_INVALID",
        `${path}[${index}]`,
        `Expected known capability (${BRIDGE_CAPABILITIES.join(", ")})`,
      );
      valid = false;
    }
  });

  return valid;
}

function validateStringRecord(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected object");
    return false;
  }

  return true;
}

function validateEmptyObject(
  value: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): boolean {
  if (!isRecord(value)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected object");
    return false;
  }

  if (Object.keys(value).length > 0) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", path, "Expected empty object");
    return false;
  }

  return true;
}

function validateOverlayInitPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid =
    validateEnum(payload.selectedVersion, [BRIDGE_VERSION], "payload.selectedVersion", issues) &&
    valid;
  valid = validateString(payload.parentOrigin, "payload.parentOrigin", issues) && valid;
  valid = validateString(payload.overlayToken, "payload.overlayToken", issues) && valid;
  valid =
    validateString(payload.overlayTokenExpiresAt, "payload.overlayTokenExpiresAt", issues) && valid;
  valid =
    validateCapabilityArray(payload.selectedCapabilities, "payload.selectedCapabilities", issues) &&
    valid;

  if (!validateStringRecord(payload.context, "payload.context", issues)) {
    valid = false;
  } else {
    valid =
      validateNumber(payload.context.organizationId, "payload.context.organizationId", issues) &&
      valid;
    valid = validateNumber(payload.context.studyId, "payload.context.studyId", issues) && valid;
    valid = validateNumber(payload.context.sectionId, "payload.context.sectionId", issues) && valid;
    valid = validateString(payload.context.sessionId, "payload.context.sessionId", issues) && valid;
    valid = validateString(payload.context.tabId, "payload.context.tabId", issues) && valid;
    if (payload.context.participantId !== undefined) {
      valid =
        validateString(payload.context.participantId, "payload.context.participantId", issues) &&
        valid;
    }
  }

  if (!validateStringRecord(payload.uiConfig, "payload.uiConfig", issues)) {
    valid = false;
  } else {
    valid =
      validateEnum(
        payload.uiConfig.defaultPosition,
        ["bottom-right", "bottom-left"],
        "payload.uiConfig.defaultPosition",
        issues,
      ) && valid;
    valid =
      validateBoolean(payload.uiConfig.showAiPersona, "payload.uiConfig.showAiPersona", issues) &&
      valid;
    if (payload.uiConfig.theme !== undefined) {
      valid =
        validateEnum(
          payload.uiConfig.theme,
          ["light", "dark", "system"],
          "payload.uiConfig.theme",
          issues,
        ) && valid;
    }
    if (payload.uiConfig.customization !== undefined) {
      valid =
        validateOverlayCustomization(
          payload.uiConfig.customization,
          "payload.uiConfig.customization",
          issues,
        ) && valid;
    }
  }

  if (!validateStringRecord(payload.consent, "payload.consent", issues)) {
    valid = false;
  } else {
    valid =
      validateEnum(
        payload.consent.mode,
        ["required", "best_effort", "off"],
        "payload.consent.mode",
        issues,
      ) && valid;
    valid =
      validateBoolean(payload.consent.captureAllowed, "payload.consent.captureAllowed", issues) &&
      valid;
  }

  return valid;
}

function validateOverlayCustomization(
  payload: unknown,
  path: string,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, path, issues)) {
    return false;
  }

  let valid = true;
  if (payload.persona !== undefined) {
    valid =
      validateEnum(payload.persona, OVERLAY_PERSONA_VARIANTS, `${path}.persona`, issues) && valid;
  }

  if (payload.typography !== undefined) {
    if (!validateStringRecord(payload.typography, `${path}.typography`, issues)) {
      valid = false;
    } else {
      for (const key of OVERLAY_TYPOGRAPHY_KEYS) {
        if (payload.typography[key] !== undefined) {
          valid =
            validateStringOrNull(payload.typography[key], `${path}.typography.${key}`, issues) &&
            valid;
        }
      }
    }
  }

  if (payload.tailwindTheme !== undefined) {
    if (!validateStringRecord(payload.tailwindTheme, `${path}.tailwindTheme`, issues)) {
      valid = false;
    } else {
      for (const key of OVERLAY_TAILWIND_THEME_KEYS) {
        if (payload.tailwindTheme[key] !== undefined) {
          valid =
            validateStringOrNull(
              payload.tailwindTheme[key],
              `${path}.tailwindTheme.${key}`,
              issues,
            ) && valid;
        }
      }
    }
  }

  return valid;
}

function validateOverlayCustomizationUpdatePayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return validateOverlayCustomization(payload.customization, "payload.customization", issues);
}

function validateOverlayTaskUpdatePayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  if (payload.activeTaskId !== null) {
    valid = validateString(payload.activeTaskId, "payload.activeTaskId", issues) && valid;
  }

  if (!Array.isArray(payload.tasks)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", "payload.tasks", "Expected array");
    return false;
  }

  payload.tasks.forEach((task, index) => {
    if (!validateStringRecord(task, `payload.tasks[${index}]`, issues)) {
      valid = false;
      return;
    }

    valid = validateString(task.id, `payload.tasks[${index}].id`, issues) && valid;
    valid =
      validateEnum(
        task.status,
        ["pending", "active", "completed", "abandoned"],
        `payload.tasks[${index}].status`,
        issues,
      ) && valid;
    valid =
      validateString(task.instruction, `payload.tasks[${index}].instruction`, issues) && valid;
    if (task.maxDurationSeconds !== undefined) {
      valid =
        validateNumber(
          task.maxDurationSeconds,
          `payload.tasks[${index}].maxDurationSeconds`,
          issues,
        ) && valid;
    }
  });

  return valid;
}

function validateOverlayNavigationContextPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid = validateString(payload.pageUrl, "payload.pageUrl", issues) && valid;
  valid = validateString(payload.pagePath, "payload.pagePath", issues) && valid;
  valid =
    validateEnum(
      payload.routeType,
      ["history", "hash", "full_reload"],
      "payload.routeType",
      issues,
    ) && valid;
  valid = validateNumber(payload.timestampMs, "payload.timestampMs", issues) && valid;
  return valid;
}

function validateOverlaySessionStatePayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid =
    validateEnum(
      payload.state,
      ["active", "paused", "ending", "ended", "degraded"],
      "payload.state",
      issues,
    ) && valid;
  if (payload.reason !== undefined) {
    valid = validateString(payload.reason, "payload.reason", issues) && valid;
  }
  return valid;
}

function validateOverlayTokenRefreshPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return (
    validateString(payload.overlayToken, "payload.overlayToken", issues) &&
    validateString(payload.overlayTokenExpiresAt, "payload.overlayTokenExpiresAt", issues)
  );
}

function validateOverlayShutdownPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return validateEnum(
    payload.reason,
    ["session_ended", "security_violation", "manual_teardown", "fatal_error"],
    "payload.reason",
    issues,
  );
}

function validateOverlayHelloPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid = validateString(payload.overlayInstanceId, "payload.overlayInstanceId", issues) && valid;
  if (!Array.isArray(payload.supportedVersions)) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", "payload.supportedVersions", "Expected array");
    valid = false;
  } else {
    payload.supportedVersions.forEach((entry, index) => {
      valid =
        validateEnum(entry, [BRIDGE_VERSION], `payload.supportedVersions[${index}]`, issues) &&
        valid;
    });
  }
  valid = validateCapabilityArray(payload.capabilities, "payload.capabilities", issues) && valid;
  valid = validateString(payload.overlayBuild, "payload.overlayBuild", issues) && valid;
  return valid;
}

function validateOverlayReadyPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid = validateString(payload.overlayInstanceId, "payload.overlayInstanceId", issues) && valid;
  valid =
    validateCapabilityArray(payload.acceptedCapabilities, "payload.acceptedCapabilities", issues) &&
    valid;
  if (!validateStringRecord(payload.media, "payload.media", issues)) {
    valid = false;
  } else {
    valid = validateBoolean(payload.media.audioReady, "payload.media.audioReady", issues) && valid;
    valid = validateBoolean(payload.media.videoReady, "payload.media.videoReady", issues) && valid;
  }
  return valid;
}

function validateOverlayUiCommandPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid =
    validateEnum(
      payload.command,
      [
        "request_minimize",
        "request_expand",
        "set_pointer_passthrough",
        "focus_overlay",
        "set_overlay_size_hint",
      ],
      "payload.command",
      issues,
    ) && valid;
  if (payload.args !== undefined) {
    valid = validateStringRecord(payload.args, "payload.args", issues) && valid;
  }
  return valid;
}

function validateOverlaySessionActionPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid =
    validateEnum(
      payload.action,
      ["end_session", "pause_capture", "resume_capture", "task_complete", "task_abandon"],
      "payload.action",
      issues,
    ) && valid;
  if (payload.taskId !== undefined) {
    valid = validateString(payload.taskId, "payload.taskId", issues) && valid;
  }
  if (payload.reason !== undefined) {
    valid = validateString(payload.reason, "payload.reason", issues) && valid;
  }
  return valid;
}

function validateOverlayTokenRefreshRequestPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return (
    validateEnum(payload.reason, ["expiring", "backend_reconnect"], "payload.reason", issues) &&
    validateString(payload.expiresAt, "payload.expiresAt", issues)
  );
}

function validateBridgeDiagnosticPayload(
  payload: unknown,
  issues: BridgeValidationIssue[],
): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  let valid = true;
  valid = validateEnum(payload.level, ["info", "warn", "error"], "payload.level", issues) && valid;
  valid = validateString(payload.code, "payload.code", issues) && valid;
  valid = validateString(payload.message, "payload.message", issues) && valid;
  if (payload.details !== undefined) {
    valid = validateStringRecord(payload.details, "payload.details", issues) && valid;
  }
  return valid;
}

function validateBridgeErrorPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return (
    validateString(payload.code, "payload.code", issues) &&
    validateString(payload.message, "payload.message", issues) &&
    validateBoolean(payload.retryable, "payload.retryable", issues) &&
    validateBoolean(payload.fatal, "payload.fatal", issues)
  );
}

function validateBridgeAckPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return (
    validateString(payload.ackMessageId, "payload.ackMessageId", issues) &&
    validateEnum(payload.status, ["ok"], "payload.status", issues)
  );
}

function validateBridgeNackPayload(payload: unknown, issues: BridgeValidationIssue[]): boolean {
  if (!validateStringRecord(payload, "payload", issues)) {
    return false;
  }

  return (
    validateString(payload.ackMessageId, "payload.ackMessageId", issues) &&
    validateEnum(payload.status, ["rejected"], "payload.status", issues) &&
    validateString(payload.code, "payload.code", issues) &&
    validateString(payload.message, "payload.message", issues) &&
    validateBoolean(payload.retryable, "payload.retryable", issues)
  );
}

const PAYLOAD_VALIDATORS: {
  [TType in BridgeMessageType]: (payload: unknown, issues: BridgeValidationIssue[]) => boolean;
} = {
  "overlay:init": validateOverlayInitPayload,
  "overlay:customization_update": validateOverlayCustomizationUpdatePayload,
  "overlay:task_update": validateOverlayTaskUpdatePayload,
  "overlay:navigation_context": validateOverlayNavigationContextPayload,
  "overlay:session_state": validateOverlaySessionStatePayload,
  "overlay:token_refresh": validateOverlayTokenRefreshPayload,
  "overlay:shutdown": validateOverlayShutdownPayload,
  "overlay:hello": validateOverlayHelloPayload,
  "overlay:ready": validateOverlayReadyPayload,
  "overlay:ui_command": validateOverlayUiCommandPayload,
  "overlay:session_action": validateOverlaySessionActionPayload,
  "overlay:token_refresh_request": validateOverlayTokenRefreshRequestPayload,
  "overlay:diagnostic": validateBridgeDiagnosticPayload,
  "overlay:error": validateBridgeErrorPayload,
  "bridge:ack": validateBridgeAckPayload,
  "bridge:nack": validateBridgeNackPayload,
  "bridge:ping": (payload, issues) => validateEmptyObject(payload, "payload", issues),
  "bridge:pong": (payload, issues) => validateEmptyObject(payload, "payload", issues),
};

function failure(
  code: BridgeErrorCode,
  message: string,
  issues: BridgeValidationIssue[],
): BridgeValidationResult<never> {
  return {
    success: false,
    error: {
      code,
      message,
      issues,
    },
  };
}

export function getBridgeMessageSpec(type: BridgeMessageType) {
  return BRIDGE_MESSAGE_SPECS[type];
}

export function getBridgeRequiresAck(type: BridgeMessageType): boolean {
  return BRIDGE_MESSAGE_SPECS[type].requiresAck;
}

export function isBridgeErrorCode(value: unknown): value is BridgeErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export function isBridgeMessageType(value: unknown): value is BridgeMessageType {
  return typeof value === "string" && MESSAGE_TYPE_SET.has(value);
}

export function isBridgeCapability(value: unknown): value is BridgeCapability {
  return isKnownCapability(value);
}

export function validateBridgeMessage(input: unknown): BridgeValidationResult<AnyBridgeMessage> {
  if (!isRecord(input)) {
    return failure("BRG_SCHEMA_INVALID", "Bridge message must be an object", [
      {
        code: "BRG_SCHEMA_INVALID",
        path: "$",
        message: "Expected object",
      },
    ]);
  }

  const issues: BridgeValidationIssue[] = [];
  let valid = true;

  if (input.namespace !== BRIDGE_NAMESPACE) {
    pushIssue(issues, "BRG_SCHEMA_INVALID", "namespace", `Expected namespace ${BRIDGE_NAMESPACE}`);
    valid = false;
  }

  if (input.version !== BRIDGE_VERSION) {
    pushIssue(
      issues,
      "BRG_PROTOCOL_VERSION_UNSUPPORTED",
      "version",
      `Expected version ${BRIDGE_VERSION}`,
    );
    valid = false;
  }

  if (!validateString(input.messageId, "messageId", issues)) {
    valid = false;
  }

  if (!validateNumber(input.sequence, "sequence", issues)) {
    valid = false;
  }

  if (!validateNumber(input.sentAtMs, "sentAtMs", issues)) {
    valid = false;
  }

  if (!validateString(input.sessionId, "sessionId", issues)) {
    valid = false;
  }

  if (!validateString(input.bridgeInstanceId, "bridgeInstanceId", issues)) {
    valid = false;
  }

  if (
    input.overlayInstanceId !== undefined &&
    !validateString(input.overlayInstanceId, "overlayInstanceId", issues)
  ) {
    valid = false;
  }

  if (
    input.correlationId !== undefined &&
    !validateString(input.correlationId, "correlationId", issues)
  ) {
    valid = false;
  }

  if (
    input.requiresAck !== undefined &&
    !validateBoolean(input.requiresAck, "requiresAck", issues)
  ) {
    valid = false;
  }

  if (!isBridgeMessageType(input.type)) {
    return failure("BRG_UNKNOWN_MESSAGE_TYPE", "Unknown bridge message type", [
      ...issues,
      {
        code: "BRG_UNKNOWN_MESSAGE_TYPE",
        path: "type",
        message: "Unknown bridge message type",
      },
    ]);
  }

  const expectedRequiresAck = getBridgeRequiresAck(input.type);
  if (input.requiresAck !== undefined && input.requiresAck !== expectedRequiresAck) {
    pushIssue(
      issues,
      "BRG_SCHEMA_INVALID",
      "requiresAck",
      `Expected requiresAck=${String(expectedRequiresAck)} for ${input.type}`,
    );
    valid = false;
  }

  if (!(input.type in PAYLOAD_VALIDATORS)) {
    return failure("BRG_UNKNOWN_MESSAGE_TYPE", "Unsupported bridge message type", issues);
  }

  const payloadValidator = PAYLOAD_VALIDATORS[input.type];
  if (!payloadValidator(input.payload, issues)) {
    valid = false;
  }

  if (!valid) {
    const errorCode = issues.some((issue) => issue.code === "BRG_PROTOCOL_VERSION_UNSUPPORTED")
      ? "BRG_PROTOCOL_VERSION_UNSUPPORTED"
      : "BRG_SCHEMA_INVALID";
    return failure(errorCode, "Bridge message failed validation", issues);
  }

  return {
    success: true,
    value: input as unknown as AnyBridgeMessage,
  };
}

export function validateBridgeMessageType<TType extends BridgeMessageType>(
  input: unknown,
  expectedType: TType,
): BridgeValidationResult<Extract<AnyBridgeMessage, { type: TType }>> {
  const result = validateBridgeMessage(input);
  if (!result.success) {
    return result;
  }

  if (result.value.type !== expectedType) {
    return failure("BRG_UNKNOWN_MESSAGE_TYPE", `Expected message type ${expectedType}`, [
      {
        code: "BRG_UNKNOWN_MESSAGE_TYPE",
        path: "type",
        message: `Expected message type ${expectedType}`,
      },
    ]);
  }

  return {
    success: true,
    value: result.value as Extract<AnyBridgeMessage, { type: TType }>,
  };
}

export function assertBridgeMessage(input: unknown): AnyBridgeMessage {
  const result = validateBridgeMessage(input);
  if (!result.success) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}
