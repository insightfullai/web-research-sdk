/**
 * SDK initialization options.
 */

import type { SdkContext } from "./sdk-context.types.js";
import type { StudyContent } from "./sdk-config.types.js";

/** Options passed to InsightfullSDK.init() or the constructor. */
export interface InsightfullInitOptions {
  /** API base URL. Defaults to "https://app.insightfull.ai". */
  apiBase?: string;
  /** Whether to auto-track pageviews. Defaults to true. */
  autoTrack?: boolean;
  /** The SDK environment client ID (public key). */
  clientId: string;
  /** Called when a study trigger matches. Override to customize how studies are displayed (modal, redirect, custom container). If not provided, the default bottom-right overlay is used. */
  onStudyTrigger?: (params: StudyTriggerParams) => void;
}

/** Parameters passed to onStudyTrigger callback. */
export interface StudyTriggerParams {
  /** The matched study content (title, branding, sections, shareUrl). */
  study: StudyContent;
  /** Fully constructed iframe URL with base64-encoded context query parameter. */
  iframeUrl: string;
  /** The raw SDK context used to build the iframe URL. */
  context: SdkContext;
}
