/**
 * SDK initialization options.
 */

import type { StudyContent } from "./sdk-config.types.js";
import type { SdkContext } from "./sdk-context.types.js";

export interface InsightfullStudyRenderPayload {
  iframeUrl: string;
  study: StudyContent;
  context: SdkContext;
  registerIframeBridge: (iframe: HTMLIFrameElement) => () => void;
  removeDefaultStudy: () => void;
}

export type InsightfullStudyRenderer = (payload: InsightfullStudyRenderPayload) => void;

/** Options passed to InsightfullSDK.init() or the constructor. */
export interface InsightfullInitOptions {
  /** API base URL. Defaults to "https://insightfull.ai". */
  apiBase?: string;
  /** Whether to auto-track pageviews. Defaults to true. */
  autoTrack?: boolean;
  /** The SDK environment client ID (public key). */
  clientId: string;
  /** Optional custom renderer. When provided, the SDK will not create the default iframe. */
  renderStudy?: InsightfullStudyRenderer;
}
