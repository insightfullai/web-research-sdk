// @vitest-environment jsdom

import {
  WEB_RESEARCH_BATCH_MESSAGE_TYPE,
  WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
  WEB_RESEARCH_PROTOCOL_VERSION,
  WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
} from "@insightfull/web-research-sdk-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmbeddedHostRuntime, createWebResearchClient } from "./index";

function createTestClient() {
  return createWebResearchClient({
    environment: "dev",
    sessionId: "session-a2",
    batching: {
      batchSize: 50,
      flushIntervalMs: 0,
    },
  });
}

function getIframeWindow(iframe: HTMLIFrameElement) {
  const iframeWindow = iframe.contentWindow as Window;
  const postMessage = vi.spyOn(iframeWindow, "postMessage");

  return { iframeWindow, postMessage };
}

function buildReadyMessage() {
  return {
    type: WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-a2",
      startedAt: "2026-04-10T12:00:00.000Z",
      environment: "dev",
    },
    sentAt: "2026-04-10T12:00:01.000Z",
  };
}

describe("EmbeddedHostRuntime", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button data-testid="cta">CTA</button>`;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("happy path handshake reaches READY", () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
      handshakeTimeoutMs: 100,
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);

    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    expect(runtime.getState()).toBe("READY");
    expect(postMessage.mock.calls[0]?.[1]).toBe("https://overlay.example.com");
  });

  it("handshake timeout transitions to DEGRADED", () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
      handshakeTimeoutMs: 100,
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));

    vi.advanceTimersByTime(100);
    expect(runtime.getState()).toBe("DEGRADED");
  });

  it("never posts to a wrong target origin", () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));

    runtime.receiveMessage(buildReadyMessage(), "https://attacker.example.com");

    expect(runtime.getState()).toBe("HANDSHAKE_PENDING");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]?.[1]).toBe("https://overlay.example.com");
  });

  it("event batches include session, environment, and protocol version", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();
    await client.flush("a2_test_flush");

    const batchCall = postMessage.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_BATCH_MESSAGE_TYPE,
    );
    const batchMessage = batchCall?.[0] as {
      version: string;
      session: { sessionId: string; environment: string };
    };
    expect(batchMessage.version).toBe(WEB_RESEARCH_PROTOCOL_VERSION);
    expect(batchMessage.session.sessionId).toBe("session-a2");
    expect(batchMessage.session.environment).toBe("dev");
  });

  it("teardown removes listeners and stops capture", async () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");

    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();
    await client.flush("before_destroy");
    const callsBeforeDestroy = postMessage.mock.calls.length;

    await runtime.destroy("a2_destroy");
    expect(postMessage.mock.calls.length).toBe(callsBeforeDestroy + 1);
    const callsAfterDestroy = postMessage.mock.calls.length;

    button.click();
    await client.flush("after_destroy");
    expect(postMessage.mock.calls.length).toBe(callsAfterDestroy);
    expect(addListenerSpy).toHaveBeenCalledWith("message", expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith("message", expect.any(Function));

    addListenerSpy.mockRestore();
    removeListenerSpy.mockRestore();
  });

  it("trigger messages include task id, status, and evidence shape", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    await runtime.signalTaskComplete({
      taskId: "task-123",
      evidence: {
        note: "Reached success criteria",
        metadata: {
          step: "confirmation",
        },
      },
    });

    const taskCompleteMessage = postMessage.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
    )?.[0] as {
      taskId: string;
      status: string;
      signal: string;
      evidence: { note?: string; metadata?: Record<string, unknown> };
    };

    expect(taskCompleteMessage.taskId).toBe("task-123");
    expect(taskCompleteMessage.status).toBe("completed");
    expect(taskCompleteMessage.signal).toBe("task_complete");
    expect(taskCompleteMessage.evidence).toMatchObject({
      note: "Reached success criteria",
      metadata: { step: "confirmation" },
    });

    const completeMessage = postMessage.mock.calls.find(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
    );
    expect(completeMessage).toBeDefined();
  });

  it("duplicate complete calls do not double-complete", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    await Promise.all([
      runtime.signalTaskComplete({ taskId: "task-123" }),
      runtime.signalTaskComplete({ taskId: "task-123" }),
    ]);

    const taskCompleteMessages = postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
    );
    const completionMessages = postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
    );

    expect(taskCompleteMessages).toHaveLength(1);
    expect(completionMessages).toHaveLength(1);
  });

  it("signalTaskComplete throws in HANDSHAKE_PENDING state", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));

    expect(runtime.getState()).toBe("HANDSHAKE_PENDING");
    await expect(runtime.signalTaskComplete({ taskId: "task-1" })).rejects.toThrow(
      "Cannot emit task signal in state HANDSHAKE_PENDING",
    );
  });

  it("signalTaskComplete throws in DEGRADED state", async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
      handshakeTimeoutMs: 100,
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);

    expect(runtime.getState()).toBe("DEGRADED");
    await expect(runtime.signalTaskComplete({ taskId: "task-1" })).rejects.toThrow(
      "Cannot emit task signal in state DEGRADED",
    );
  });

  it("mount throws while teardown is in progress", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    const destroyPromise = runtime.destroy("teardown");
    expect(() => runtime.mount()).toThrow("Cannot mount while teardown is in progress");
    await destroyPromise;
  });

  it("mount succeeds after teardown completes", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    await runtime.destroy("teardown");

    expect(runtime.getIframe()).toBeNull();
    expect(() => runtime.mount()).not.toThrow();
  });

  it("transient send error recovers and flush resumes", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    let shouldFailBatchSend = true;
    postMessage.mockImplementation((message) => {
      if (
        shouldFailBatchSend &&
        (message as { type?: string }).type === WEB_RESEARCH_BATCH_MESSAGE_TYPE
      ) {
        shouldFailBatchSend = false;
        throw new Error("transient send failure");
      }
      return undefined;
    });

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();
    await expect(client.flush("first_flush")).rejects.toThrow("transient send failure");

    button.click();
    await client.flush("second_flush");

    const batchMessages = postMessage.mock.calls
      .map((call) => call[0] as { type?: string; events?: Array<{ name: string }> })
      .filter((message) => message.type === WEB_RESEARCH_BATCH_MESSAGE_TYPE);
    const finalBatch = batchMessages.at(-1);

    expect(finalBatch?.events?.filter((event) => event.name === "dom.click")).toHaveLength(2);
  });

  it("destroy and complete cleanly stop capture", async () => {
    const client = createTestClient();
    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc: "https://overlay.example.com/embed",
    });

    runtime.mount();
    const iframe = runtime.getIframe() as HTMLIFrameElement;
    const { postMessage } = getIframeWindow(iframe);
    iframe.dispatchEvent(new Event("load"));
    runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

    const button = document.querySelector("button") as HTMLButtonElement;
    button.click();
    await runtime.signalTaskAbandon({
      taskId: "task-abandon",
      reason: "partner_cancelled",
      evidence: {
        note: "Partner API cancel",
      },
    });

    const callsAfterCompletion = postMessage.mock.calls.length;
    button.click();
    await client.flush("post_complete_flush");

    const abandonMessages = postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string }).type === WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
    );
    expect(abandonMessages).toHaveLength(1);
    expect(postMessage.mock.calls.length).toBe(callsAfterCompletion);
    expect(runtime.getState()).toBe("TERMINATED");
    expect(runtime.getIframe()).toBeNull();
  });

  describe("R2.2 — SDK lifecycle observability", () => {
    it("onStateChange fires for each state transition", () => {
      const transitions: Array<{
        state: string;
        previousState: string;
        context?: { reason?: string; diagnostic?: string };
      }> = [];
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        handshakeTimeoutMs: 100,
        onStateChange: (state, previousState, context) => {
          transitions.push({ state, previousState, context });
        },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        state: "IFRAME_LOADING",
        previousState: "UNMOUNTED",
        context: undefined,
      });

      iframe.dispatchEvent(new Event("load"));

      expect(transitions).toHaveLength(2);
      expect(transitions[1]).toEqual({
        state: "HANDSHAKE_PENDING",
        previousState: "IFRAME_LOADING",
        context: undefined,
      });

      runtime.receiveMessage(buildReadyMessage(), "https://overlay.example.com");

      expect(transitions).toHaveLength(3);
      expect(transitions[2]).toEqual({
        state: "READY",
        previousState: "HANDSHAKE_PENDING",
        context: undefined,
      });
    });

    it("onStateChange fires with context on DEGRADED from timeout", () => {
      vi.useFakeTimers();
      const transitions: Array<{
        state: string;
        previousState: string;
        context?: { reason?: string; diagnostic?: string };
      }> = [];
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        handshakeTimeoutMs: 100,
        onStateChange: (state, previousState, context) => {
          transitions.push({ state, previousState, context });
        },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      vi.advanceTimersByTime(100);

      const degradedTransition = transitions.find((t) => t.state === "DEGRADED");
      expect(degradedTransition).toBeDefined();
      expect(degradedTransition!.context).toEqual({ reason: "handshake_timeout" });
    });

    it("console.warn fires on DEGRADED transition", () => {
      vi.useFakeTimers();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        handshakeTimeoutMs: 100,
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      vi.advanceTimersByTime(100);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("DEGRADED"),
      );
      warnSpy.mockRestore();
    });

    it("getSnapshot returns initial state before mount", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      const snapshot = runtime.getSnapshot();
      expect(snapshot.state).toBe("UNMOUNTED");
      expect(snapshot.handshakeElapsedMs).toBeNull();
      expect(snapshot.lastFlushAt).toBeNull();
      expect(snapshot.bufferedEvents).toBe(0);
    });

    it("getSnapshot returns handshakeElapsedMs after handshake starts", () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        handshakeTimeoutMs: 5000,
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      vi.advanceTimersByTime(200);

      const snapshot = runtime.getSnapshot();
      expect(snapshot.state).toBe("HANDSHAKE_PENDING");
      expect(snapshot.handshakeElapsedMs).toBeGreaterThanOrEqual(200);
    });

    it("getSnapshot reflects state after destroy", async () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      await runtime.destroy("test");

      const snapshot = runtime.getSnapshot();
      expect(snapshot.state).toBe("TERMINATED");
      expect(snapshot.handshakeElapsedMs).toBeNull();
    });
  });

  describe("R2.5 — event.source validation", () => {
    it("receiveMessage ignores messages from a mismatched source", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      const wrongSource = {} as MessageEventSource;
      runtime.receiveMessage(
        buildReadyMessage(),
        "https://overlay.example.com",
        wrongSource,
      );

      expect(runtime.getState()).toBe("HANDSHAKE_PENDING");
    });

    it("receiveMessage accepts messages with null source", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      runtime.receiveMessage(
        buildReadyMessage(),
        "https://overlay.example.com",
        null,
      );

      expect(runtime.getState()).toBe("READY");
    });

    it("receiveMessage accepts messages with undefined source", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      runtime.receiveMessage(
        buildReadyMessage(),
        "https://overlay.example.com",
        undefined,
      );

      expect(runtime.getState()).toBe("READY");
    });

    it("receiveMessage accepts messages from correct iframe source", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;
      const { iframeWindow } = getIframeWindow(iframe);
      iframe.dispatchEvent(new Event("load"));

      runtime.receiveMessage(
        buildReadyMessage(),
        "https://overlay.example.com",
        iframeWindow as unknown as MessageEventSource,
      );

      expect(runtime.getState()).toBe("READY");
    });
  });

  describe("R2.7 — Configurable iframe dimensions", () => {
    it("uses default position bottom-right when no overlay config", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.position).toBe("fixed");
      expect(iframe.style.right).toBe("16px");
      expect(iframe.style.bottom).toBe("16px");
      expect(iframe.style.width).toBe("420px");
      expect(iframe.style.height).toBe("640px");
      expect(iframe.style.zIndex).toBe("2147483600");
    });

    it("applies bottom-left position", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        overlay: { position: "bottom-left" },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.left).toBe("16px");
      expect(iframe.style.bottom).toBe("16px");
      expect(iframe.style.right).toBe("");
    });

    it("applies top-right position", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        overlay: { position: "top-right" },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.right).toBe("16px");
      expect(iframe.style.top).toBe("16px");
      expect(iframe.style.bottom).toBe("");
    });

    it("applies top-left position", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        overlay: { position: "top-left" },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.left).toBe("16px");
      expect(iframe.style.top).toBe("16px");
      expect(iframe.style.bottom).toBe("");
    });

    it("applies center position", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        overlay: { position: "center" },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.top).toBe("50%");
      expect(iframe.style.left).toBe("50%");
      expect(iframe.style.transform).toBe("translate(-50%, -50%)");
    });

    it("applies custom width, height, zIndex, and offset", () => {
      const client = createTestClient();
      const runtime = createEmbeddedHostRuntime({
        client,
        iframeSrc: "https://overlay.example.com/embed",
        overlay: {
          width: "600px",
          height: "800px",
          zIndex: "9999",
          offset: "32px",
          position: "bottom-right",
        },
      });

      runtime.mount();
      const iframe = runtime.getIframe() as HTMLIFrameElement;

      expect(iframe.style.width).toBe("600px");
      expect(iframe.style.height).toBe("800px");
      expect(iframe.style.zIndex).toBe("9999");
      expect(iframe.style.right).toBe("32px");
      expect(iframe.style.bottom).toBe("32px");
    });
  });
});
