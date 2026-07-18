import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightfullIframeBridge } from "../iframe-bridge/iframe-bridge.js";
import type {
  InsightfullDisplayStateCallback,
  InsightfullIframeMessage,
} from "../iframe-bridge/iframe-bridge.js";
import type {
  InsightfullActivityEvidenceCallback,
  InsightfullResponseCompletedCallback,
} from "../iframe-bridge/participant-bridge-contracts.js";

const IFRAME_URL = "https://iframe.example.com/study/alpha?ctx=abc";
const BRIDGE_NONCE = "nonce-1234567890";
const RECORDING_SESSION_ID = "recording_session_123";

function makeIframe(src = IFRAME_URL): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  document.body.appendChild(iframe);
  return iframe;
}

function makeSessionMessage(id: string): InsightfullIframeMessage {
  return {
    type: "insightfull.recording_session",
    version: 1,
    recordingSessionId: id,
    state: "started",
    context: {
      sdkEnvironmentId: "env_test",
      visitorId: "visitor-123",
      userId: null,
      customId: { account: "acct-123" },
      customAttributes: { plan: "pro" },
      url: "https://host.example.com/checkout",
      path: "/checkout",
      studyId: 42,
    },
  };
}

function makeLiveEventMessage(id: string, sequence: number): InsightfullIframeMessage {
  return {
    type: "insightfull.recording_event",
    version: 1,
    recordingSessionId: id,
    format: "dom-event-stream",
    formatVersion: "1",
    event: { sequence },
  };
}

function dispatchReady(
  iframe: HTMLIFrameElement,
  overrides: Partial<{
    nonce: string;
    origin: string;
    source: MessageEventSource | null;
    studyId: number;
  }> = {},
): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        type: "insightfull.iframe_ready",
        version: 1,
        studyId: overrides.studyId ?? 42,
        nonce: overrides.nonce ?? BRIDGE_NONCE,
      },
      origin: overrides.origin ?? "https://iframe.example.com",
      source: overrides.source ?? iframe.contentWindow,
    }),
  );
}

function makeActivityEvidenceMessage(overrides: Record<string, unknown> = {}) {
  return {
    evidence: {
      captureOffsetMs: 1200,
      delivery: "silent",
      evidenceId: "5b38db9d-e06f-47dc-8b36-bf66b7687023",
      facts: { actionId: "apply_promo_code", kind: "click" },
      kind: "click",
      occurredAt: "2026-01-01T12:00:01.200Z",
      recordingSessionId: RECORDING_SESSION_ID,
      sequence: 1,
      version: 1,
    },
    nonce: BRIDGE_NONCE,
    responseId: 91_002,
    sectionResponseId: 91_020,
    studyId: 42,
    type: "insightfull.recording_activity_evidence",
    version: 1,
    ...overrides,
  };
}

function dispatchParticipantMessage(
  iframe: HTMLIFrameElement,
  data: unknown,
  overrides: Partial<{
    origin: string;
    source: MessageEventSource | null;
  }> = {},
): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: overrides.origin ?? "https://iframe.example.com",
      source: overrides.source ?? iframe.contentWindow,
    }),
  );
}

describe("InsightfullIframeBridge", () => {
  let bridge: InsightfullIframeBridge;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    bridge?.destroy();
    vi.restoreAllMocks();
  });

  it("queues messages before readiness and posts exact message shapes to the iframe origin", () => {
    bridge = new InsightfullIframeBridge({ maxQueueSize: 5 });
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    const state = bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    const sessionMessage = makeSessionMessage("session-1");
    const eventMessage = makeLiveEventMessage("session-1", 1);

    expect(state).toMatchObject({
      active: true,
      ready: false,
      targetOrigin: "https://iframe.example.com",
    });
    expect(bridge.send(sessionMessage)).toBe(true);
    expect(bridge.send(eventMessage)).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();

    dispatchReady(iframe);

    expect(bridge.getState()).toMatchObject({ queueSize: 0, ready: true });
    expect(postMessage).toHaveBeenNthCalledWith(1, sessionMessage, "https://iframe.example.com");
    expect(postMessage).toHaveBeenNthCalledWith(2, eventMessage, "https://iframe.example.com");
    expect(postMessage.mock.calls.map((call) => call[1] as unknown)).not.toContain("*");
  });

  it("accepts iframe readiness only when origin, source, studyId, and nonce match", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    const message = makeSessionMessage("session-1");

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(message);

    dispatchReady(iframe);

    expect(bridge.getState().ready).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(message, "https://iframe.example.com");
  });

  it("rejects iframe readiness with the wrong origin", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { origin: "https://attacker.example.com" });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects iframe readiness with the wrong source", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const otherIframe = makeIframe("https://iframe.example.com/other");
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { source: otherIframe.contentWindow });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects iframe readiness with the wrong studyId", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { studyId: 99 });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects iframe readiness with the wrong nonce", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { nonce: "nonce-wrong-12345" });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("drops the oldest pre-ready messages when the bounded queue is full", () => {
    bridge = new InsightfullIframeBridge({ maxQueueSize: 2 });
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    const first = makeLiveEventMessage("session-1", 1);
    const second = makeLiveEventMessage("session-1", 2);
    const third = makeLiveEventMessage("session-1", 3);

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(first);
    bridge.send(second);
    bridge.send(third);

    expect(bridge.getState().queueSize).toBe(2);
    dispatchReady(iframe);

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(1, second, "https://iframe.example.com");
    expect(postMessage).toHaveBeenNthCalledWith(2, third, "https://iframe.example.com");
  });

  it("is a safe no-op when no iframe is active", () => {
    bridge = new InsightfullIframeBridge();

    expect(() => bridge.send(makeSessionMessage("session-1"))).not.toThrow();
    expect(bridge.send(makeSessionMessage("session-1"))).toBe(false);
    expect(bridge.getState()).toEqual({
      active: false,
      queueSize: 0,
      ready: false,
      studyId: null,
      targetOrigin: null,
    });
  });

  it("unregisters only the matching study iframe and stops accepting readiness", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    const message = makeSessionMessage("session-1");

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    expect(bridge.send(message)).toBe(true);

    bridge.unregisterIframe(99);
    expect(bridge.getState()).toMatchObject({
      active: true,
      queueSize: 1,
      studyId: 42,
    });

    bridge.unregisterIframe(42);
    expect(bridge.getState()).toEqual({
      active: false,
      queueSize: 0,
      ready: false,
      studyId: null,
      targetOrigin: null,
    });

    dispatchReady(iframe);
    expect(postMessage).not.toHaveBeenCalled();
    expect(bridge.send(message)).toBe(false);
  });

  it("destroy removes the window listener and clears pending messages", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    expect(bridge.send(makeSessionMessage("session-1"))).toBe(true);

    bridge.destroy();
    dispatchReady(iframe);

    expect(bridge.getState()).toEqual({
      active: false,
      queueSize: 0,
      ready: false,
      studyId: null,
      targetOrigin: null,
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  // ── Display state messages ────────────────────────────────────────

  function dispatchDisplayState(
    iframe: HTMLIFrameElement,
    state: "expanded" | "minimized",
    overrides: Partial<{
      nonce: string;
      origin: string;
      source: MessageEventSource | null;
      studyId: number;
    }> = {},
  ): void {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "insightfull.iframe_display_state",
          version: 1,
          state,
          studyId: overrides.studyId ?? 42,
          nonce: overrides.nonce ?? BRIDGE_NONCE,
        },
        origin: overrides.origin ?? "https://iframe.example.com",
        source: overrides.source ?? iframe.contentWindow,
      }),
    );
  }

  it("invokes onDisplayStateChange when a valid display state message arrives", () => {
    const callback: InsightfullDisplayStateCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onDisplayStateChange: callback });
    const iframe = makeIframe();

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    dispatchDisplayState(iframe, "minimized");

    expect(callback).toHaveBeenCalledWith("minimized", 42);
  });

  it("ignores display state messages from the wrong origin", () => {
    const callback: InsightfullDisplayStateCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onDisplayStateChange: callback });
    const iframe = makeIframe();

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    dispatchDisplayState(iframe, "minimized", {
      origin: "https://attacker.example.com",
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores display state messages with the wrong nonce", () => {
    const callback: InsightfullDisplayStateCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onDisplayStateChange: callback });
    const iframe = makeIframe();

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    dispatchDisplayState(iframe, "minimized", { nonce: "nonce-wrong-12345" });

    expect(callback).not.toHaveBeenCalled();
  });

  it("handles rapid state changes (minimize → expand → minimize)", () => {
    const callback: InsightfullDisplayStateCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onDisplayStateChange: callback });
    const iframe = makeIframe();

    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    dispatchDisplayState(iframe, "minimized");
    dispatchDisplayState(iframe, "expanded");
    dispatchDisplayState(iframe, "minimized");

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, "minimized", 42);
    expect(callback).toHaveBeenNthCalledWith(2, "expanded", 42);
    expect(callback).toHaveBeenNthCalledWith(3, "minimized", 42);
  });

  it("does not invoke callback when no iframe is active", () => {
    const callback: InsightfullDisplayStateCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onDisplayStateChange: callback });
    const iframe = makeIframe();
    document.body.appendChild(iframe);

    dispatchDisplayState(iframe, "minimized");

    expect(callback).not.toHaveBeenCalled();
  });

  it("accepts strict activity evidence only for the active origin, source, nonce, response, and recording session", () => {
    const callback: InsightfullActivityEvidenceCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onActivityEvidence: callback });
    const iframe = makeIframe();
    const otherIframe = makeIframe("https://iframe.example.com/other");
    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    bridge.send(makeSessionMessage(RECORDING_SESSION_ID));
    dispatchParticipantMessage(iframe, {
      nonce: BRIDGE_NONCE,
      responseId: 91_002,
      sectionResponseId: 91_020,
      studyId: 42,
      type: "insightfull.recording_context",
      version: 1,
    });

    dispatchParticipantMessage(iframe, makeActivityEvidenceMessage(), {
      origin: "https://attacker.example.com",
    });
    dispatchParticipantMessage(iframe, makeActivityEvidenceMessage(), {
      source: otherIframe.contentWindow,
    });
    dispatchParticipantMessage(iframe, makeActivityEvidenceMessage({ nonce: "wrong-nonce-12345" }));
    dispatchParticipantMessage(iframe, makeActivityEvidenceMessage({ responseId: 91_003 }));
    dispatchParticipantMessage(
      iframe,
      makeActivityEvidenceMessage({
        evidence: {
          ...makeActivityEvidenceMessage().evidence,
          recordingSessionId: "different_session_123",
        },
      }),
    );
    dispatchParticipantMessage(
      iframe,
      makeActivityEvidenceMessage({
        evidence: {
          ...makeActivityEvidenceMessage().evidence,
          captureOffsetMs: 30 * 60 * 1000 + 1,
        },
      }),
    );
    dispatchParticipantMessage(
      iframe,
      makeActivityEvidenceMessage({
        evidence: {
          ...makeActivityEvidenceMessage().evidence,
          facts: {
            ...makeActivityEvidenceMessage().evidence.facts,
            inputValue: "private",
          },
        },
      }),
    );
    dispatchParticipantMessage(iframe, makeActivityEvidenceMessage({ unexpected: "private" }));
    expect(callback).not.toHaveBeenCalled();

    const validMessage = makeActivityEvidenceMessage();
    dispatchParticipantMessage(iframe, validMessage);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(validMessage);
  });

  it("delivers one completion callback after strict response binding and ignores duplicates", () => {
    const callback: InsightfullResponseCompletedCallback = vi.fn();
    bridge = new InsightfullIframeBridge({ onResponseCompleted: callback });
    const iframe = makeIframe();
    const otherIframe = makeIframe("https://iframe.example.com/other");
    bridge.registerIframe({
      iframe,
      iframeUrl: IFRAME_URL,
      nonce: BRIDGE_NONCE,
      studyId: 42,
    });
    const completion = {
      nonce: BRIDGE_NONCE,
      responseId: 91_002,
      studyId: 42,
      type: "insightfull.response_completed",
      version: 1,
    } as const;

    dispatchParticipantMessage(iframe, completion);
    dispatchParticipantMessage(iframe, {
      nonce: BRIDGE_NONCE,
      responseId: 91_002,
      studyId: 42,
      type: "insightfull.recording_context",
      version: 1,
    });
    dispatchParticipantMessage(iframe, {
      ...completion,
      nonce: "wrong-nonce-12345",
    });
    dispatchParticipantMessage(iframe, { ...completion, responseId: 91_003 });
    dispatchParticipantMessage(iframe, { ...completion, unexpected: true });
    dispatchParticipantMessage(iframe, completion, {
      origin: "https://attacker.example.com",
    });
    dispatchParticipantMessage(iframe, completion, {
      source: otherIframe.contentWindow,
    });
    expect(callback).not.toHaveBeenCalled();

    dispatchParticipantMessage(iframe, completion);
    dispatchParticipantMessage(iframe, completion);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(completion);
  });
});
