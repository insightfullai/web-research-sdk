import type { GlobalSettings, StudyContent, TriggerFilter } from "../types/index.js";

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
export function isCooldownExpired(studyId: number, cooldownDays: number): boolean {
  try {
    const key = `${COOLDOWN_PREFIX}${studyId}`;
    const lastDisplay = localStorage.getItem(key);
    if (!lastDisplay) {
      return true;
    }

    const parsed = Number.parseInt(lastDisplay, 10);
    if (!Number.isFinite(parsed)) return true; // invalid value, treat as expired
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    return Date.now() - parsed > cooldownMs;
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
  // Sort studies by their highest-priority trigger (descending)
  const studiesWithPriority = studies
    .filter((study) => study.triggers.length > 0)
    .map((study) => ({
      study,
      maxPriority: Math.max(...study.triggers.map((t) => t.priority)),
    }))
    .sort((a, b) => b.maxPriority - a.maxPriority);

  for (const { study } of studiesWithPriority) {
    // Check cooldown for this study
    if (!isCooldownExpired(study.id, globalSettings.cooldownDays)) {
      continue;
    }

    // Find a matching trigger
    const matchingTrigger = study.triggers.find((trigger) => {
      if (!trigger.isActive) {
        return false;
      }

      const triggerMatches =
        trigger.matchOn === "url"
          ? eventName === "pageview" &&
            currentUrl !== undefined &&
            matchesUrl(trigger.eventName, currentUrl)
          : trigger.eventName === eventName;
      if (!triggerMatches) {
        return false;
      }

      // All filters must match
      return trigger.filters.every((filter) => matchesFilter(filter, attributes, customId));
    });

    if (matchingTrigger) {
      return study;
    }
  }

  return null;
}
