/**
 * SDK initialization options.
 */

import type { InsightfullIframeDisplayState } from "../iframe-bridge/iframe-bridge.js";
import type {
  InsightfullActivityEvidenceCallback,
  InsightfullResponseCompletedCallback,
} from "../iframe-bridge/participant-bridge-contracts.js";
import type { HostContextV1 } from "./host-context.types.js";
import type { StudyContent } from "./sdk-config.types.js";
import type { SdkContext } from "./sdk-context.types.js";

export interface InsightfullStudyRenderPayload {
  iframeUrl: string;
  study: StudyContent;
  context: SdkContext;
  registerIframeBridge: (iframe: HTMLIFrameElement) => () => void;
  removeDefaultStudy: () => void;
  /**
   * Called when the iframe requests a display state change.
   * Custom renderers should hide/show their container accordingly.
   * The default renderer handles this automatically; this callback is
   * only invoked when a custom `renderStudy` is provided.
   */
  onDisplayStateChange?: ((state: InsightfullIframeDisplayState) => void) | undefined;
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
  /** Called for strict, verified activity evidence messages from the active study iframe. */
  onActivityEvidence?: InsightfullActivityEvidenceCallback;
  /** Called once for each server-confirmed response completion from the active study iframe. */
  onResponseCompleted?: InsightfullResponseCompletedCallback;
  /** Optional custom renderer. When provided, the SDK will not create the default iframe. */
  renderStudy?: InsightfullStudyRenderer;
}

/** Per-event launch options. Host context is validated and never inferred from event payloads. */
export interface InsightfullTrackOptions {
  hostContext?: HostContextV1;
}
