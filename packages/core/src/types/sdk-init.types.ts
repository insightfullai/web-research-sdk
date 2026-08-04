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
  /** Permanently close the active interview and run renderer cleanup. */
  dismiss: () => void;
  /** Expand the active interview without remounting its iframe. */
  expand: () => void;
  iframeUrl: string;
  /** Minimize the active interview without remounting its iframe. */
  minimize: () => void;
  study: StudyContent;
  context: SdkContext;
  registerIframeBridge: (iframe: HTMLIFrameElement) => () => void;
  /** Subscribe to minimize/expand requests from the iframe or host SDK. */
  onDisplayStateChange: (callback: (state: InsightfullIframeDisplayState) => void) => () => void;
}

export type InsightfullStudyRenderer = (
  payload: InsightfullStudyRenderPayload,
) => void | (() => void);

/** Appearance controls for the dependency-free default iframe renderer. */
export interface InsightfullAppearanceOptions {
  /** Minimized pill background. Accepts any valid CSS color. */
  accentColor?: string;
  /** Corner radius in pixels. */
  borderRadius?: number;
  /** Expanded height in pixels. */
  height?: number;
  /** Label shown while the interview is minimized. */
  minimizedLabel?: string;
  /** Viewport edge used by the minimized pill. */
  minimizedPlacement?: "bottom-left" | "bottom-right";
  /** Distance from the viewport edge in pixels. */
  offset?: number;
  /** Viewport placement. */
  placement?: "bottom-left" | "bottom-right" | "center";
  /** Minimized pill text color. Accepts any valid CSS color. */
  textColor?: string;
  /** Expanded width in pixels. */
  width?: number;
  /** Overlay stacking order. */
  zIndex?: number;
}

/** Options passed to InsightfullSDK.init() or the constructor. */
export interface InsightfullInitOptions {
  /** Appearance controls for the default renderer. Ignored when `renderStudy` is provided. */
  appearance?: InsightfullAppearanceOptions;
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
