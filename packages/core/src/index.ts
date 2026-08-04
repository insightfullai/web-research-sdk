/**
 * @insightfull/web-research-sdk
 *
 * Drop-in vanilla JS SDK for event-triggered study delivery.
 *
 * Usage:
 *   import { InsightfullSDK } from "@insightfull/web-research-sdk";
 *   const sdk = InsightfullSDK.init({ clientId: "env_abc123" });
 *   sdk.identify("user_123", { plan: "pro" });
 *   sdk.track("checkout_completed", { total: 99.99 });
 */

// biome-ignore lint/performance/noBarrelFile: library-level entry point
export { InsightfullInitializationError, InsightfullSDK } from "./insightfull-sdk.js";
export type {
  InsightfullInitializationErrorCode,
  InsightfullSdkStatus,
} from "./insightfull-sdk.js";
export type {
  InsightfullDisplayStateCallback,
  InsightfullIframeBridgeState,
  InsightfullIframeDisplayState,
  InsightfullIframeDisplayStateMessage,
  InsightfullIframeMessage,
  InsightfullIframeReadyMessage,
  InsightfullRecorderSafeAttributeValue,
  InsightfullRecorderSafeContext,
  InsightfullRecordingContext,
  InsightfullRecordingLiveEventMessage,
  InsightfullRecordingSessionMessage,
} from "./iframe-bridge/iframe-bridge.js";
export type {
  InsightfullActivityEvidenceCallback,
  InsightfullRecordingActivityEvidenceMessage,
  InsightfullRecordingContextMessage,
  InsightfullResponseCompletedCallback,
  InsightfullResponseCompletedMessage,
  RealAppActivityEvidenceV1,
} from "./iframe-bridge/participant-bridge-contracts.js";
export { REAL_APP_ACTIVITY_EVIDENCE_V1_LIMITS } from "./iframe-bridge/participant-bridge-contracts.js";
export type {
  AttributeEvent,
  GlobalSettings,
  IdentifyEvent,
  InsightfullAppearanceOptions,
  InsightfullInitOptions,
  InsightfullStudyRenderer,
  InsightfullStudyRenderPayload,
  InsightfullTrackOptions,
  PageviewEvent,
  SdkConfig,
  SdkContext,
  SdkEnvironment,
  SdkEvent,
  SdkEventType,
  StudyBranding,
  StudyContent,
  StudySection,
  StudyTrigger,
  TrackEvent,
  TriggerFilter,
  TriggerFilterOperator,
} from "./types/index.js";
export type {
  HostContext,
  HostContextStateValue,
  HostContextV1,
} from "./types/host-context.types.js";
export { HOST_CONTEXT_V1_LIMITS, validateHostContext } from "./types/host-context.types.js";

// Register globally for script-tag usage
import { InsightfullSDK } from "./insightfull-sdk.js";

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).InsightfullSDK = InsightfullSDK;
}
