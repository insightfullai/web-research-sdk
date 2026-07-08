import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightfullIframeBridge } from "../iframe-bridge/iframe-bridge.js";
import type { InsightfullIframeMessage } from "../iframe-bridge/iframe-bridge.js";

const IFRAME_URL = "https://iframe.example.com/study/alpha?ctx=abc";

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
        nonce: overrides.nonce ?? "nonce-123",
      },
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
      nonce: "nonce-123",
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

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
    bridge.send(message);

    dispatchReady(iframe);

    expect(bridge.getState().ready).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(message, "https://iframe.example.com");
  });

  it("rejects iframe readiness with the wrong origin", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
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

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { source: otherIframe.contentWindow });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects iframe readiness with the wrong studyId", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { studyId: 99 });

    expect(bridge.getState()).toMatchObject({ queueSize: 1, ready: false });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects iframe readiness with the wrong nonce", () => {
    bridge = new InsightfullIframeBridge();
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
    bridge.send(makeSessionMessage("session-1"));
    dispatchReady(iframe, { nonce: "nonce-wrong" });

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

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
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

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
    expect(bridge.send(message)).toBe(true);

    bridge.unregisterIframe(99);
    expect(bridge.getState()).toMatchObject({ active: true, queueSize: 1, studyId: 42 });

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

    bridge.registerIframe({ iframe, iframeUrl: IFRAME_URL, nonce: "nonce-123", studyId: 42 });
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
});
