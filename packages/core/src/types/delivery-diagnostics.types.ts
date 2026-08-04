import type { TriggerFilterOperator } from "./sdk-config.types.js";

/** Stable reason codes for explaining why an interview was or was not delivered. */
export type InsightfullDeliveryReasonCode =
  | "active_study_present"
  | "another_study_selected"
  | "configuration_pending"
  | "configuration_unavailable"
  | "cooldown_active"
  | "direct_launch_active"
  | "event_mismatch"
  | "filter_mismatch"
  | "matched"
  | "no_matching_study"
  | "no_studies"
  | "renderer_failed"
  | "sdk_destroyed"
  | "study_has_no_triggers"
  | "trigger_inactive"
  | "url_mismatch";

/** Final result of a delivery evaluation. */
export type InsightfullDeliveryOutcome =
  | "deferred"
  | "matched"
  | "not_matched"
  | "presented"
  | "suppressed";

/** Privacy-safe filter result. Attribute and configured comparison values are never included. */
export interface InsightfullDeliveryFilterEvaluation {
  matched: boolean;
  operator: TriggerFilterOperator;
  property: string;
}

/** Evaluation details for one configured trigger. */
export interface InsightfullDeliveryTriggerEvaluation {
  eventName: string;
  filters: readonly InsightfullDeliveryFilterEvaluation[];
  index: number;
  isActive: boolean;
  matchOn: "event" | "url";
  outcome: "matched" | "not_matched";
  priority: number;
  reasonCode: InsightfullDeliveryReasonCode;
}

/** Evaluation details for one study in the current environment. */
export interface InsightfullDeliveryStudyEvaluation {
  outcome: "matched" | "not_matched" | "suppressed";
  reasonCode: InsightfullDeliveryReasonCode;
  studyId: number;
  triggers: readonly InsightfullDeliveryTriggerEvaluation[];
}

/**
 * A complete, privacy-safe explanation of an SDK delivery decision.
 *
 * The trace contains configured property names and match results, but never
 * participant attribute values or configured comparison values.
 */
export interface InsightfullDeliveryEvaluation {
  eventName: string;
  outcome: InsightfullDeliveryOutcome;
  pathname: string;
  reasonCode: InsightfullDeliveryReasonCode;
  selectedStudyId: number | null;
  studies: readonly InsightfullDeliveryStudyEvaluation[];
  timestamp: number;
}

export type InsightfullDeliveryEvaluationCallback = (
  evaluation: InsightfullDeliveryEvaluation,
) => void;

/** Options for a non-mutating local delivery explanation. */
export interface InsightfullExplainDeliveryOptions {
  /** Override the current pathname. Useful in preview tools and automated tests. */
  pathname?: string;
}
