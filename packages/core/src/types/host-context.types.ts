const HOST_CONTEXT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HOST_STATE_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,47}$/;
const ROUTE_TEMPLATE_PATTERN = /^\/[A-Za-z0-9_/:.-]*$/;
const SAFE_STATE_STRING_PATTERN = /^(?:|[A-Za-z0-9][A-Za-z0-9 _.-]{0,119})$/;

export const HOST_CONTEXT_V1_LIMITS = {
  maxLabelLength: 160,
  maxSerializedBytes: 2048,
  maxStateFields: 12,
  maxStateNumberMagnitude: 1_000_000,
  maxStateStringLength: 120,
} as const;

const FORBIDDEN_HOST_STATE_KEY_FRAGMENTS = [
  "accountid",
  "address",
  "authorization",
  "card",
  "cookie",
  "cvv",
  "dom",
  "email",
  "header",
  "html",
  "input",
  "inputvalue",
  "ipaddress",
  "name",
  "path",
  "password",
  "payment",
  "phone",
  "promocode",
  "query",
  "referrer",
  "screenshot",
  "selector",
  "sessionid",
  "storage",
  "text",
  "token",
  "url",
  "userid",
  "visitorid",
  "xpath",
] as const;

const PRIVATE_HOST_VALUE_PATTERNS = [
  /(?:https?:\/\/|www\.)/i,
  /[?#]/,
  /<\/?[A-Za-z][^>]*>/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /(?:^|\s)\+?\d[\d\s().-]{5,}\d(?:\s|$)/,
  /^(?:\/\/|\.\.?\/|\/[^\s]*)/,
  /\b(?:\d[ -]*?){13,19}\b/,
] as const;

export type HostContextStateValue = string | number | boolean | null;

export interface HostContextV1 {
  scenario: {
    id: string;
    label: string;
  };
  state?: Record<string, HostContextStateValue>;
  surface: {
    id: string;
    label: string;
    routeTemplate?: string;
  };
  task?: {
    id: string;
    label: string;
  };
  version: 1;
}

export type HostContext = HostContextV1 | undefined;

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

const containsPrivateHostValue = (value: string): boolean =>
  PRIVATE_HOST_VALUE_PATTERNS.some((pattern) => pattern.test(value));

const isHostContextId = (value: unknown): value is string =>
  typeof value === "string" && HOST_CONTEXT_ID_PATTERN.test(value);

const parseLabel = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= maxLength &&
    !containsPrivateHostValue(normalized)
    ? normalized
    : null;
};

const parseState = (value: unknown): Record<string, HostContextStateValue> | null => {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length > HOST_CONTEXT_V1_LIMITS.maxStateFields) {
    return null;
  }

  const state: Record<string, HostContextStateValue> = {};
  for (const [key, rawValue] of entries) {
    const normalizedKey = key.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
    if (
      !HOST_STATE_KEY_PATTERN.test(key) ||
      FORBIDDEN_HOST_STATE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))
    ) {
      return null;
    }

    if (typeof rawValue === "string") {
      const normalizedValue = rawValue.trim();
      if (
        normalizedValue.length > HOST_CONTEXT_V1_LIMITS.maxStateStringLength ||
        !SAFE_STATE_STRING_PATTERN.test(normalizedValue) ||
        containsPrivateHostValue(normalizedValue)
      ) {
        return null;
      }
      state[key] = normalizedValue;
      continue;
    }
    if (typeof rawValue === "number") {
      if (
        !Number.isFinite(rawValue) ||
        Math.abs(rawValue) > HOST_CONTEXT_V1_LIMITS.maxStateNumberMagnitude
      ) {
        return null;
      }
      state[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean" || rawValue === null) {
      state[key] = rawValue;
      continue;
    }
    return null;
  }
  return state;
};

const serializedByteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/**
 * Validate and normalize public host context without reading browser or identity state.
 * Invalid values return null so study launch can continue without host context.
 */
export function validateHostContext(value: unknown): HostContextV1 | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "scenario", "surface"], ["task", "state"]) ||
    value.version !== 1 ||
    !isRecord(value.scenario) ||
    !hasExactKeys(value.scenario, ["id", "label"]) ||
    !isHostContextId(value.scenario.id) ||
    !isRecord(value.surface) ||
    !hasExactKeys(value.surface, ["id", "label"], ["routeTemplate"]) ||
    !isHostContextId(value.surface.id)
  ) {
    return null;
  }

  const scenarioLabel = parseLabel(value.scenario.label, 120);
  const surfaceLabel = parseLabel(value.surface.label, 120);
  if (!(scenarioLabel && surfaceLabel)) {
    return null;
  }

  const context: HostContextV1 = {
    scenario: { id: value.scenario.id, label: scenarioLabel },
    surface: { id: value.surface.id, label: surfaceLabel },
    version: 1,
  };

  if (value.surface.routeTemplate !== undefined) {
    if (
      typeof value.surface.routeTemplate !== "string" ||
      value.surface.routeTemplate.length > 256 ||
      !ROUTE_TEMPLATE_PATTERN.test(value.surface.routeTemplate)
    ) {
      return null;
    }
    context.surface.routeTemplate = value.surface.routeTemplate;
  }

  if (value.task !== undefined) {
    if (
      !isRecord(value.task) ||
      !hasExactKeys(value.task, ["id", "label"]) ||
      !isHostContextId(value.task.id)
    ) {
      return null;
    }
    const taskLabel = parseLabel(value.task.label, HOST_CONTEXT_V1_LIMITS.maxLabelLength);
    if (!taskLabel) {
      return null;
    }
    context.task = { id: value.task.id, label: taskLabel };
  }

  if (value.state !== undefined) {
    const state = parseState(value.state);
    if (!state) {
      return null;
    }
    context.state = state;
  }

  return serializedByteLength(context) <= HOST_CONTEXT_V1_LIMITS.maxSerializedBytes
    ? context
    : null;
}
