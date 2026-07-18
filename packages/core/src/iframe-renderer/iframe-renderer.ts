/**
 * iframe renderer — creates a positioned div with an iframe to display a study.
 *
 * Supports display states for in-app testing:
 * - "expanded": full-size iframe overlay (default).
 * - "minimized": small pill at the bottom; iframe contentWindow stays alive
 *   so the postMessage bridge and recorder keep working.
 */

import type {
  InsightfullIframeDisplayState,
  InsightfullStudyRenderPayload,
  SdkContext,
  StudyContent,
} from "../types/index.js";

const IFRAME_ID_PREFIX = "insightfull-study-";

export interface RenderStudyOptions {
  onBeforeRemoveExisting?: (studyId: number) => void;
  onDisplayStateChange?: (state: InsightfullIframeDisplayState) => void;
  onIframeCreated?: (payload: {
    iframe: HTMLIFrameElement;
    iframeUrl: string;
    nonce: string | null;
    studyId: number;
  }) => void;
  registerIframeBridge?: (payload: {
    iframe: HTMLIFrameElement;
    iframeUrl: string;
    nonce: string | null;
    studyId: number;
  }) => () => void;
  removeDefaultStudy?: () => void;
}

/**
 * Build a base64-encoded context payload for the iframe URL.
 */
export function buildContextPayload(context: SdkContext): string {
  const json = JSON.stringify(context);
  // btoa works for ASCII/Latin1. For broader Unicode support, use TextEncoder.
  try {
    return btoa(json);
  } catch {
    // Fallback for Unicode content
    const bytes = new TextEncoder().encode(json);
    const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binary);
  }
}

/**
 * Build the iframe URL for a study using the same context encoding as the default renderer.
 */
export function buildStudyIframeUrl(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
): string {
  const payload = buildContextPayload(context);
  const shareSlug = study.shareUrl ?? `id/${study.id}`;
  return `${apiBase}/study/${shareSlug}?ctx=${encodeURIComponent(payload)}`;
}

/**
 * Build the typed payload shared by the default renderer and host-provided custom renderers.
 */
export function buildStudyRenderPayload(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
  options: Pick<
    RenderStudyOptions,
    "registerIframeBridge" | "removeDefaultStudy" | "onDisplayStateChange"
  > = {},
): InsightfullStudyRenderPayload {
  const iframeUrl = buildStudyIframeUrl(apiBase, study, context);
  return {
    iframeUrl,
    study,
    context,
    registerIframeBridge: (iframe) =>
      options.registerIframeBridge?.({
        iframe,
        iframeUrl,
        nonce: context.iframeBridge?.nonce ?? null,
        studyId: study.id,
      }) ?? (() => undefined),
    removeDefaultStudy: options.removeDefaultStudy ?? (() => removeStudy(study.id)),
    onDisplayStateChange: options.onDisplayStateChange,
  };
}

/**
 * Render a study in a positioned iframe overlay.
 * Returns the host div element.
 *
 * The host contains two children:
 * - An iframe wrapper (visible when expanded)
 * - A minimized pill (visible when minimized; click to expand)
 *
 * When minimized, the iframe is hidden via CSS but never removed from the DOM,
 * so its contentWindow and the postMessage bridge stay alive.
 */
export function renderStudy(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
  options: RenderStudyOptions = {},
): HTMLDivElement {
  const renderPayload = buildStudyRenderPayload(apiBase, study, context, options);

  // Remove existing iframe if present
  options.onBeforeRemoveExisting?.(study.id);
  removeStudy(study.id);

  // Create host element
  const host = document.createElement("div");
  host.id = `${IFRAME_ID_PREFIX}${study.id}`;
  host.dataset.displayState = "expanded";
  host.style.cssText = [
    "position: fixed",
    "bottom: 20px",
    "right: 20px",
    "width: 420px",
    "height: 640px",
    "z-index: 999999",
    "border: none",
    "border-radius: 12px",
    "box-shadow: 0 8px 32px rgba(0,0,0,0.15)",
    "overflow: hidden",
    "transition: width 200ms ease, height 200ms ease",
  ].join("; ");

  // Create iframe wrapper (holds the iframe; hidden when minimized)
  const iframeWrapper = document.createElement("div");
  iframeWrapper.dataset.role = "insightfull-iframe-wrapper";
  iframeWrapper.style.cssText = "width:100%;height:100%;";

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.src = renderPayload.iframeUrl;
  iframe.style.cssText = "width:100%;height:100%;border:none;border-radius:12px;";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("title", study.title ?? `Study ${study.id}`);

  iframeWrapper.appendChild(iframe);
  host.appendChild(iframeWrapper);

  // Create minimized pill (hidden by default; visible when minimized)
  const pill = createMinimizedPill(study);
  pill.style.display = "none";
  pill.addEventListener("click", () => {
    setStudyDisplayState(study.id, "expanded");
  });
  host.appendChild(pill);

  document.body.appendChild(host);
  options.onIframeCreated?.({
    iframe,
    iframeUrl: renderPayload.iframeUrl,
    nonce: context.iframeBridge?.nonce ?? null,
    studyId: study.id,
  });

  return host;
}

/**
 * Create the minimized pill element shown when the study iframe is collapsed.
 * Shows an Insightfull logo dot and a pulsing indicator. Clicking expands.
 */
function createMinimizedPill(study: StudyContent): HTMLButtonElement {
  const pill = document.createElement("button");
  pill.type = "button";
  pill.dataset.role = "insightfull-minimized-pill";
  pill.setAttribute("aria-label", `Expand ${study.title ?? "study"}`);
  pill.setAttribute("title", study.title ?? "Insightfull Study");
  pill.style.cssText = [
    "display: flex",
    "align-items: center",
    "gap: 8px",
    "padding: 8px 16px",
    "background: #4f46e5",
    "color: #ffffff",
    "border: none",
    "border-radius: 9999px",
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "font-size: 13px",
    "font-weight: 600",
    "cursor: pointer",
    "box-shadow: 0 4px 12px rgba(0,0,0,0.2)",
    "transition: background 150ms ease",
  ].join("; ");

  const dot = document.createElement("span");
  dot.style.cssText = [
    "display: inline-block",
    "width: 8px",
    "height: 8px",
    "border-radius: 50%",
    "background: #34d399",
    "animation: insightfull-pulse 1.5s ease-in-out infinite",
  ].join("; ");

  const label = document.createElement("span");
  label.textContent = "Insightfull";

  pill.appendChild(dot);
  pill.appendChild(label);

  // Inject the pulse keyframes once
  injectPulseKeyframes();

  return pill;
}

let pulseKeyframesInjected = false;

function injectPulseKeyframes(): void {
  if (pulseKeyframesInjected || typeof document === "undefined") {
    return;
  }
  pulseKeyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = [
    "@keyframes insightfull-pulse {",
    "  0%, 100% { opacity: 1; transform: scale(1); }",
    "  50% { opacity: 0.5; transform: scale(0.8); }",
    "}",
  ].join("\n");
  document.head.appendChild(style);
}

/**
 * Apply a display state to a rendered study container.
 *
 * - "expanded": full-size iframe overlay with the pill hidden.
 * - "minimized": iframe wrapper hidden, pill shown. The iframe element stays
 *   in the DOM so its contentWindow and postMessage bridge remain active.
 *
 * Safe no-op if the study container does not exist.
 */
export function setStudyDisplayState(studyId: number, state: InsightfullIframeDisplayState): void {
  const host = document.getElementById(`${IFRAME_ID_PREFIX}${studyId}`);
  if (!host) {
    return;
  }

  const wrapper = host.querySelector<HTMLElement>('[data-role="insightfull-iframe-wrapper"]');
  const pill = host.querySelector<HTMLElement>('[data-role="insightfull-minimized-pill"]');

  if (state === "minimized") {
    host.dataset.displayState = "minimized";
    host.style.width = "auto";
    host.style.height = "auto";
    if (wrapper) {
      wrapper.style.display = "none";
    }
    if (pill) {
      pill.style.display = "flex";
    }
  } else {
    host.dataset.displayState = "expanded";
    host.style.width = "420px";
    host.style.height = "640px";
    if (wrapper) {
      wrapper.style.display = "block";
    }
    if (pill) {
      pill.style.display = "none";
    }
  }
}

/**
 * Remove a study iframe from the DOM.
 */
export function removeStudy(studyId: number): void {
  const existing = document.getElementById(`${IFRAME_ID_PREFIX}${studyId}`);
  if (existing) {
    existing.remove();
  }
}
