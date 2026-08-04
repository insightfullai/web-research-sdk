import type {
  InsightfullAppearanceOptions,
  InsightfullIframeDisplayState,
  InsightfullStudyRenderPayload,
  SdkContext,
  StudyContent,
} from "../types/index.js";

const IFRAME_ID_PREFIX = "insightfull-study-";

export interface RenderStudyOptions {
  appearance?: InsightfullAppearanceOptions;
  onBeforeRemoveExisting?: (studyId: number) => void;
  onDisplayStateRequest?: (state: InsightfullIframeDisplayState) => void;
  subscribeToDisplayState?: (
    callback: (state: InsightfullIframeDisplayState) => void,
  ) => () => void;
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
  dismissStudy?: () => void;
  expandStudy?: () => void;
  minimizeStudy?: () => void;
}

export function buildContextPayload(context: SdkContext): string {
  const { agentLaunchToken: _agentLaunchToken, ...iframeContext } = context;
  const json = JSON.stringify(iframeContext);
  try {
    return btoa(json);
  } catch {
    const bytes = new TextEncoder().encode(json);
    const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binary);
  }
}

export function buildStudyIframeUrl(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
): string {
  const payload = buildContextPayload(context);
  const shareSlug = study.shareUrl ?? `id/${study.id}`;
  const iframeUrl = `${apiBase}/study/${shareSlug}?ctx=${encodeURIComponent(payload)}`;
  if (!context.agentLaunchToken) {
    return iframeUrl;
  }
  const fragment = new URLSearchParams();
  fragment.set("instfl_agent", context.agentLaunchToken);
  return `${iframeUrl}#${fragment.toString()}`;
}

export function buildStudyRenderPayload(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
  options: Pick<
    RenderStudyOptions,
    | "dismissStudy"
    | "expandStudy"
    | "minimizeStudy"
    | "registerIframeBridge"
    | "subscribeToDisplayState"
  > = {},
): InsightfullStudyRenderPayload {
  const iframeUrl = buildStudyIframeUrl(apiBase, study, context);
  return {
    dismiss: options.dismissStudy ?? (() => removeStudy(study.id)),
    expand: options.expandStudy ?? (() => undefined),
    iframeUrl,
    minimize: options.minimizeStudy ?? (() => undefined),
    study,
    context,
    registerIframeBridge: (iframe) =>
      options.registerIframeBridge?.({
        iframe,
        iframeUrl,
        nonce: context.iframeBridge?.nonce ?? null,
        studyId: study.id,
      }) ?? (() => undefined),
    onDisplayStateChange: options.subscribeToDisplayState ?? (() => () => undefined),
  };
}

export function renderStudy(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
  options: RenderStudyOptions = {},
): HTMLDivElement {
  const renderPayload = buildStudyRenderPayload(apiBase, study, context, options);
  const appearance = normalizeAppearance(options.appearance);

  options.onBeforeRemoveExisting?.(study.id);
  removeStudy(study.id);

  const host = document.createElement("div");
  host.id = `${IFRAME_ID_PREFIX}${study.id}`;
  host.dataset.displayState = "expanded";
  host.dataset.expandedHeight = `${appearance.height}px`;
  host.dataset.expandedWidth = `${appearance.width}px`;
  host.dataset.minimizedPlacement = appearance.minimizedPlacement;
  host.dataset.offset = `${appearance.offset}`;
  host.dataset.placement = appearance.placement;
  host.style.cssText = [
    "position: fixed",
    `width: ${appearance.width}px`,
    `height: ${appearance.height}px`,
    `max-width: calc(100vw - ${appearance.offset * 2}px)`,
    `max-height: calc(100vh - ${appearance.offset * 2}px)`,
    `z-index: ${appearance.zIndex}`,
    "border: none",
    `border-radius: ${appearance.borderRadius}px`,
    "box-shadow: 0 8px 32px rgba(0,0,0,0.15)",
    "overflow: hidden",
    "transition: width 200ms ease, height 200ms ease",
  ].join("; ");
  applyPlacement(host, appearance.placement, appearance.offset);

  const iframeWrapper = document.createElement("div");
  iframeWrapper.dataset.role = "insightfull-iframe-wrapper";
  iframeWrapper.style.cssText = "width:100%;height:100%;";

  const iframe = document.createElement("iframe");
  iframe.src = renderPayload.iframeUrl;
  iframe.style.cssText = `width:100%;height:100%;border:none;border-radius:${appearance.borderRadius}px;`;
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("title", study.title ?? `Study ${study.id}`);

  iframeWrapper.appendChild(iframe);
  host.appendChild(iframeWrapper);

  const pill = createMinimizedPill(study, appearance);
  pill.style.display = "none";
  pill.addEventListener("click", () => {
    if (options.onDisplayStateRequest) {
      options.onDisplayStateRequest("expanded");
      return;
    }
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

interface NormalizedAppearance {
  accentColor: string;
  borderRadius: number;
  height: number;
  minimizedLabel: string;
  minimizedPlacement: "bottom-left" | "bottom-right";
  offset: number;
  placement: "bottom-left" | "bottom-right" | "center";
  textColor: string;
  width: number;
  zIndex: number;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function normalizeAppearance(options: InsightfullAppearanceOptions = {}): NormalizedAppearance {
  const placement = options.placement ?? "bottom-right";
  return {
    accentColor: options.accentColor ?? "#4f46e5",
    borderRadius: clamp(options.borderRadius, 12, 0, 48),
    height: clamp(options.height, 640, 320, 1200),
    minimizedLabel: options.minimizedLabel?.trim() || "Insightfull",
    minimizedPlacement:
      options.minimizedPlacement ?? (placement === "bottom-left" ? "bottom-left" : "bottom-right"),
    offset: clamp(options.offset, 20, 0, 200),
    placement,
    textColor: options.textColor ?? "#ffffff",
    width: clamp(options.width, 420, 280, 1200),
    zIndex: clamp(options.zIndex, 999_999, 1, 2_147_483_647),
  };
}

function applyPlacement(
  host: HTMLElement,
  placement: "bottom-left" | "bottom-right" | "center",
  offset: number,
): void {
  host.style.inset = "auto";
  host.style.transform = "none";
  if (placement === "center") {
    host.style.left = "50%";
    host.style.top = "50%";
    host.style.transform = "translate(-50%, -50%)";
    return;
  }
  host.style.bottom = `${offset}px`;
  host.style[placement === "bottom-left" ? "left" : "right"] = `${offset}px`;
}

function createMinimizedPill(
  study: StudyContent,
  appearance: NormalizedAppearance,
): HTMLButtonElement {
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
    `background: ${appearance.accentColor}`,
    `color: ${appearance.textColor}`,
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
  label.textContent = appearance.minimizedLabel;

  pill.appendChild(dot);
  pill.appendChild(label);

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
    applyPlacement(
      host,
      host.dataset.minimizedPlacement === "bottom-left" ? "bottom-left" : "bottom-right",
      Number(host.dataset.offset ?? 20),
    );
    if (wrapper) {
      wrapper.style.display = "none";
    }
    if (pill) {
      pill.style.display = "flex";
    }
  } else {
    host.dataset.displayState = "expanded";
    host.style.width = host.dataset.expandedWidth ?? "420px";
    host.style.height = host.dataset.expandedHeight ?? "640px";
    const placement = host.dataset.placement;
    applyPlacement(
      host,
      placement === "bottom-left" || placement === "center" ? placement : "bottom-right",
      Number(host.dataset.offset ?? 20),
    );
    if (wrapper) {
      wrapper.style.display = "block";
    }
    if (pill) {
      pill.style.display = "none";
    }
  }
}

export function removeStudy(studyId: number): void {
  const existing = document.getElementById(`${IFRAME_ID_PREFIX}${studyId}`);
  if (existing) {
    existing.remove();
  }
}
