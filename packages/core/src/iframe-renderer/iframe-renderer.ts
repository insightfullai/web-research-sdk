/**
 * iframe renderer — creates a positioned div with an iframe to display a study.
 */

import type { SdkContext, StudyContent } from "../types/index.js";

const IFRAME_ID_PREFIX = "insightfull-study-";

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
 * Render a study in a positioned iframe overlay.
 * Returns the host div element.
 */
export function renderStudy(
  apiBase: string,
  study: StudyContent,
  context: SdkContext,
): HTMLDivElement {
  // Remove existing iframe if present
  removeStudy(study.id);

  // Create host element
  const host = document.createElement("div");
  host.id = `${IFRAME_ID_PREFIX}${study.id}`;
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
  ].join("; ");

  // Build iframe URL with context payload
  const payload = buildContextPayload(context);
  const shareSlug = study.shareUrl ?? `id/${study.id}`;
  const iframeSrc = `${apiBase}/study/${shareSlug}?ctx=${encodeURIComponent(payload)}`;

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.src = iframeSrc;
  iframe.style.cssText = "width:100%;height:100%;border:none;border-radius:12px;";
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("title", study.title ?? `Study ${study.id}`);

  host.appendChild(iframe);
  document.body.appendChild(host);

  return host;
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
