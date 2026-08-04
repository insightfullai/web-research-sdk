import type {
  GlobalSettings,
  InsightfullDeliveryEvaluation,
  InsightfullDeliveryReasonCode,
  InsightfullDeliveryStudyEvaluation,
  InsightfullDeliveryTriggerEvaluation,
  StudyContent,
  StudyTrigger,
  TriggerFilter,
} from "../types/index.js";

const COOLDOWN_PREFIX = "insightfull_cooldown_";

function resolveProperty(
  property: string,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
): unknown {
  if (property.startsWith("customId.")) {
    const key = property.slice("customId.".length);
    return customId[key];
  }

  const parts = property.split(".");
  let current: unknown = attributes;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

export function matchesFilter(
  filter: TriggerFilter,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
): boolean {
  const resolvedValue = resolveProperty(filter.property, attributes, customId);

  const contains = (): boolean => {
    if (typeof resolvedValue === "string" && typeof filter.value === "string") {
      return resolvedValue.includes(filter.value);
    }
    if (Array.isArray(resolvedValue)) {
      return resolvedValue.includes(filter.value);
    }
    return false;
  };
  const numericComparison = (predicate: (left: number, right: number) => boolean): boolean => {
    const left = typeof resolvedValue === "number" ? resolvedValue : Number.NaN;
    const right = typeof filter.value === "number" ? filter.value : Number(filter.value);
    return Number.isFinite(left) && Number.isFinite(right) && predicate(left, right);
  };

  switch (filter.operator) {
    case "contains":
      return contains();
    case "equals":
      return resolvedValue === filter.value;
    case "exists":
      return resolvedValue !== undefined && resolvedValue !== null;
    case "greater_than":
      return numericComparison((left, right) => left > right);
    case "less_than":
      return numericComparison((left, right) => left < right);
    case "not_contains":
      return !contains();
    case "not_equals":
      return resolvedValue !== filter.value;
    case "not_exists":
      return resolvedValue === undefined || resolvedValue === null;
    default:
      console.warn(`Unrecognized filter operator: ${String(filter.operator)}`);
      return false;
  }
}

/**
 * Check if the cooldown for a study has expired.
 * Returns true if the study can be shown (cooldown expired or never set).
 */
export function isCooldownExpired(
  studyId: number,
  cooldownDays: number,
  now = Date.now(),
): boolean {
  try {
    const key = `${COOLDOWN_PREFIX}${studyId}`;
    const lastDisplay = localStorage.getItem(key);
    if (!lastDisplay) {
      return true;
    }

    const parsed = Number.parseInt(lastDisplay, 10);
    if (!Number.isFinite(parsed)) return true; // invalid value, treat as expired
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    return now - parsed > cooldownMs;
  } catch {
    // localStorage unavailable (SSR, privacy mode, etc.)
    return true;
  }
}

/**
 * Set a cooldown for a study so it doesn't re-appear immediately.
 */
export function setCooldown(studyId: number): void {
  try {
    const key = `${COOLDOWN_PREFIX}${studyId}`;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Match a URL pattern against a pathname using simple glob.
 * Wildcard `*` matches any sequence of characters, `?` matches a single character.
 */
export function matchesUrl(pattern: string, pathname: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`);
  return regex.test(pathname);
}

export interface TriggerEvaluationResult {
  evaluation: InsightfullDeliveryEvaluation;
  matchedStudy: StudyContent | null;
}

function evaluateTrigger(
  trigger: StudyTrigger,
  index: number,
  eventName: string,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
  pathname: string,
): InsightfullDeliveryTriggerEvaluation {
  const filterEvaluations = trigger.filters.map((filter) => ({
    matched: matchesFilter(filter, attributes, customId),
    operator: filter.operator,
    property: filter.property,
  }));
  const base = {
    eventName: trigger.eventName,
    filters: filterEvaluations,
    index,
    isActive: trigger.isActive,
    matchOn: trigger.matchOn ?? "event",
    priority: trigger.priority,
  } as const;

  if (!trigger.isActive) {
    return { ...base, outcome: "not_matched", reasonCode: "trigger_inactive" };
  }

  if (trigger.matchOn === "url") {
    if (eventName !== "pageview" || !matchesUrl(trigger.eventName, pathname)) {
      return { ...base, outcome: "not_matched", reasonCode: "url_mismatch" };
    }
  } else if (trigger.eventName !== eventName) {
    return { ...base, outcome: "not_matched", reasonCode: "event_mismatch" };
  }

  if (filterEvaluations.some((filter) => !filter.matched)) {
    return { ...base, outcome: "not_matched", reasonCode: "filter_mismatch" };
  }

  return { ...base, outcome: "matched", reasonCode: "matched" };
}

function getStudyReasonCode(
  triggers: readonly InsightfullDeliveryTriggerEvaluation[],
): InsightfullDeliveryReasonCode {
  const reasonPriority: readonly InsightfullDeliveryReasonCode[] = [
    "filter_mismatch",
    "url_mismatch",
    "event_mismatch",
    "trigger_inactive",
  ];
  for (const reasonCode of reasonPriority) {
    if (triggers.some((trigger) => trigger.reasonCode === reasonCode)) {
      return reasonCode;
    }
  }
  return "no_matching_study";
}

function evaluateStudy(
  study: StudyContent,
  eventName: string,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
  pathname: string,
  cooldownDays: number,
  now: number,
): InsightfullDeliveryStudyEvaluation {
  if (study.triggers.length === 0) {
    return {
      outcome: "not_matched",
      reasonCode: "study_has_no_triggers",
      studyId: study.id,
      triggers: [],
    };
  }

  if (!isCooldownExpired(study.id, cooldownDays, now)) {
    return {
      outcome: "suppressed",
      reasonCode: "cooldown_active",
      studyId: study.id,
      triggers: [],
    };
  }

  const triggers = study.triggers.map((trigger, index) =>
    evaluateTrigger(trigger, index, eventName, attributes, customId, pathname),
  );
  const didMatch = triggers.some((trigger) => trigger.outcome === "matched");
  return {
    outcome: didMatch ? "matched" : "not_matched",
    reasonCode: didMatch ? "matched" : getStudyReasonCode(triggers),
    studyId: study.id,
    triggers,
  };
}

/** Evaluate every configured study and return a privacy-safe decision trace. */
export function evaluateTriggersWithDiagnostics(
  eventName: string,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
  studies: StudyContent[],
  globalSettings: GlobalSettings,
  pathname = "",
  now = Date.now(),
): TriggerEvaluationResult {
  const prioritizedStudies = studies
    .map((study, index) => ({
      index,
      maxPriority:
        study.triggers.length === 0
          ? Number.NEGATIVE_INFINITY
          : Math.max(...study.triggers.map((trigger) => trigger.priority)),
      study,
    }))
    .sort((left, right) => right.maxPriority - left.maxPriority || left.index - right.index);

  let matchedStudy: StudyContent | null = null;
  const studyEvaluations: InsightfullDeliveryStudyEvaluation[] = [];
  for (const { study } of prioritizedStudies) {
    const evaluation = evaluateStudy(
      study,
      eventName,
      attributes,
      customId,
      pathname,
      globalSettings.cooldownDays,
      now,
    );
    if (evaluation.outcome !== "matched") {
      studyEvaluations.push(evaluation);
    } else if (!matchedStudy) {
      matchedStudy = study;
      studyEvaluations.push(evaluation);
    } else {
      studyEvaluations.push({
        ...evaluation,
        outcome: "suppressed",
        reasonCode: "another_study_selected",
      });
    }
  }

  const reasonCode: InsightfullDeliveryReasonCode = matchedStudy
    ? "matched"
    : studies.length === 0
      ? "no_studies"
      : "no_matching_study";

  return {
    evaluation: {
      eventName,
      outcome: matchedStudy ? "matched" : "not_matched",
      pathname,
      reasonCode,
      selectedStudyId: matchedStudy?.id ?? null,
      studies: studyEvaluations,
      timestamp: now,
    },
    matchedStudy,
  };
}

/**
 * Evaluate all triggers across all studies for a given event.
 * Returns the first matching study (sorted by priority, highest first)
 * or null if no triggers match.
 */
export function evaluateTriggers(
  eventName: string,
  attributes: Record<string, unknown>,
  customId: Record<string, string>,
  studies: StudyContent[],
  globalSettings: GlobalSettings,
  currentUrl?: string,
): StudyContent | null {
  return evaluateTriggersWithDiagnostics(
    eventName,
    attributes,
    customId,
    studies,
    globalSettings,
    currentUrl,
  ).matchedStudy;
}
