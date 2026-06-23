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
export { InsightfullSDK } from "./insightfull-sdk.js";
export type {
  AttributeEvent,
  GlobalSettings,
  IdentifyEvent,
  InsightfullInitOptions,
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
} from "./types/index.js";

// Register globally for script-tag usage
import { InsightfullSDK } from "./insightfull-sdk.js";

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).InsightfullSDK = InsightfullSDK;
}
