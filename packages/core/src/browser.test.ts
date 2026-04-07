// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCallbackTransport, createWebResearchClient, WebResearchEventQueue } from "./index";
import type { WebResearchEventBatch, WebResearchTransportCompletePayload } from "./types";

describe("BrowserWebResearchSession", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("captures host-page events and flushes them through the configured transport", async () => {
    document.body.innerHTML = `
      <main>
        <button data-testid="cta">Run task</button>
        <form data-testid="profile-form">
          <input name="email" />
          <select name="plan">
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </select>
        </form>
      </main>
    `;

    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const session = client.startBrowserSession();
    const button = document.querySelector("button") as HTMLButtonElement;
    const input = document.querySelector("input") as HTMLInputElement;
    const select = document.querySelector("select") as HTMLSelectElement;
    const form = document.querySelector("form") as HTMLFormElement;

    button.click();
    input.value = "person@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    select.value = "pro";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    window.history.pushState({}, "", "/pricing");
    window.location.hash = "details";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await session.flush("test_flush");

    expect(batches).toHaveLength(1);
    expect(batches[0]?.reason).toBe("test_flush");
    expect(batches[0]?.events.map((event) => event.name)).toEqual([
      "navigation",
      "dom.click",
      "dom.input",
      "dom.change",
      "dom.submit",
      "navigation",
      "navigation",
    ]);
    expect(batches[0]?.events[2]?.payload).toMatchObject({ valueLength: 18 });
    const clickPayload = batches[0]?.events[1]?.payload as {
      element?: {
        text?: string;
        id?: string;
        name?: string;
        hasDataTestId?: boolean;
      };
    };
    expect(clickPayload?.element?.text).toBe(undefined);
    expect(clickPayload?.element?.id).toBe(undefined);
    expect(clickPayload?.element?.name).toBe(undefined);
    expect(clickPayload?.element?.hasDataTestId).toBe(true);
    expect(batches[0]?.events[5]?.payload).toMatchObject({
      path: "/pricing",
      routeType: "history",
    });
    expect(session.getSnapshot()).toMatchObject({
      active: true,
      capturedEvents: 7,
      bufferedEvents: 0,
    });
  });

  it("captures input and change from a custom iframe realm", async () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow as Window & typeof globalThis;
    const iframeDocument = iframe.contentDocument as Document;
    iframeDocument.body.innerHTML = `
      <form>
        <input name="email" />
        <select name="plan">
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
        </select>
      </form>
    `;

    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const session = client.startBrowserSession({
      captureInitialNavigation: false,
      window: iframeWindow,
      document: iframeDocument,
    });

    const input = iframeDocument.querySelector("input") as HTMLInputElement;
    const select = iframeDocument.querySelector("select") as HTMLSelectElement;

    input.value = "person@example.com";
    input.dispatchEvent(new iframeWindow.Event("input", { bubbles: true }));
    select.value = "pro";
    select.dispatchEvent(new iframeWindow.Event("change", { bubbles: true }));

    await session.flush("cross_realm");

    expect(batches).toHaveLength(1);
    expect(batches[0]?.events.map((event) => event.name)).toEqual(["dom.input", "dom.change"]);
    expect(batches[0]?.events[0]?.payload).toMatchObject({ valueLength: 18 });
    expect(batches[0]?.events[1]?.payload).toMatchObject({ valueLength: 3 });
  });

  it("supports complete and destroy without capturing after teardown", async () => {
    document.body.innerHTML = `<button data-testid="after-destroy">After destroy</button>`;

    const completions: WebResearchTransportCompletePayload[] = [];
    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
        onComplete: (payload) => {
          completions.push(payload);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const session = client.startBrowserSession({ captureInitialNavigation: false });
    const button = document.querySelector("button") as HTMLButtonElement;

    button.click();
    await session.destroy("session_end");
    button.click();

    expect(batches).toHaveLength(1);
    expect(batches[0]?.events).toHaveLength(1);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ reason: "session_end" });
    expect(session.getSnapshot()).toMatchObject({ active: false, capturedEvents: 1 });
  });

  it("stops capture on complete so dropped events do not change metrics", async () => {
    document.body.innerHTML = `<button data-testid="after-complete">After complete</button>`;

    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const session = client.startBrowserSession({ captureInitialNavigation: false });
    const button = document.querySelector("button") as HTMLButtonElement;

    button.click();
    await session.complete("session_complete");
    const snapshotAfterComplete = session.getSnapshot();

    button.click();
    await session.flush("post_complete_flush");

    expect(snapshotAfterComplete).toMatchObject({ active: false, capturedEvents: 1 });
    expect(session.getSnapshot()).toMatchObject({ active: false, capturedEvents: 1 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ reason: "session_complete" });
  });

  it("can start a fresh browser session after the prior one completes", async () => {
    document.body.innerHTML = `<button data-testid="restartable">Restartable</button>`;

    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const firstSession = client.startBrowserSession({ captureInitialNavigation: false });
    const button = document.querySelector("button") as HTMLButtonElement;

    button.click();
    await firstSession.complete("first_complete");

    const secondSession = client.startBrowserSession({ captureInitialNavigation: false });
    button.click();
    await secondSession.flush("second_flush");

    expect(secondSession).not.toBe(firstSession);
    expect(firstSession.getSnapshot()).toMatchObject({ active: false, capturedEvents: 1 });
    expect(secondSession.getSnapshot()).toMatchObject({ active: true, capturedEvents: 1 });
    expect(batches).toHaveLength(2);
    expect(batches[0]).toMatchObject({ reason: "first_complete" });
    expect(batches[1]).toMatchObject({ reason: "second_flush" });
  });

  it("redacts query and hash data from navigation payloads by default", async () => {
    window.history.replaceState({}, "", "/signup?email=person@example.com#token=secret");

    const batches: WebResearchEventBatch[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          batches.push(batch);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    const session = client.startBrowserSession();
    await session.flush("test_navigation_redaction");

    const navigationPayload = batches[0]?.events.find((event) => event.name === "navigation")
      ?.payload as {
      href?: string;
      path?: string;
      hasQuery?: boolean;
      hasHash?: boolean;
      titleLength?: number;
    };

    expect(navigationPayload).toMatchObject({
      href: "http://localhost:3000/signup",
      path: "/signup",
      hasQuery: true,
      hasHash: true,
      titleLength: 0,
    });
    expect(navigationPayload?.href).not.toContain("?");
    expect(navigationPayload?.href).not.toContain("#");
    expect(navigationPayload?.path).not.toContain("?");
    expect(navigationPayload?.path).not.toContain("#");
  });
});

describe("WebResearchEventQueue", () => {
  it("drains events enqueued while an async shutdown flush is in flight", async () => {
    const batches: WebResearchEventBatch[] = [];
    const completions: WebResearchTransportCompletePayload[] = [];
    let resolveFirstSend: (() => void) | undefined;
    const firstSend = new Promise<void>((resolve) => {
      resolveFirstSend = resolve;
    });
    let queue: WebResearchEventQueue;
    const sendSpy = vi.fn(async (batch: WebResearchEventBatch) => {
      batches.push(batch);
      if (batches.length === 1) {
        queue.enqueue({ name: "event.two", payload: {} }, "manual");
        await firstSend;
      }
    });
    queue = new WebResearchEventQueue({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
      },
      transport: {
        send: sendSpy,
        complete: async (payload) => {
          completions.push(payload);
        },
      },
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    queue.enqueue({ name: "event.one", payload: {} }, "manual");
    const completionPromise = queue.complete("shutdown");
    resolveFirstSend?.();
    await completionPromise;

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.events.map((event) => event.name)).toEqual(["event.one"]);
    expect(batches[1]?.events.map((event) => event.name)).toEqual(["event.two"]);
    expect(completions).toHaveLength(1);
    expect(queue.getSnapshot()).toMatchObject({ bufferedEvents: 0 });
  });

  it("recovers from transient send failures and flushes future batches", async () => {
    const batches: WebResearchEventBatch[] = [];
    let shouldFailFirstSend = true;
    const queue = new WebResearchEventQueue({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
      },
      transport: {
        send: async (batch) => {
          if (shouldFailFirstSend) {
            shouldFailFirstSend = false;
            throw new Error("transient transport failure");
          }
          batches.push(batch);
        },
      },
      batching: {
        batchSize: 10,
        flushIntervalMs: 0,
      },
    });

    queue.enqueue({ name: "event.one", payload: {} }, "manual");
    await expect(queue.flush("first_flush")).rejects.toThrow("transient transport failure");

    queue.enqueue({ name: "event.two", payload: {} }, "manual");
    await queue.flush("second_flush");

    expect(batches).toHaveLength(1);
    expect(batches[0]?.reason).toBe("second_flush");
    expect(batches[0]?.events.map((event) => event.name)).toEqual(["event.one", "event.two"]);
    expect(queue.getSnapshot()).toMatchObject({ bufferedEvents: 0 });
  });

  it("normalizes non-finite batching options to safe defaults", async () => {
    vi.useFakeTimers();

    const batches: WebResearchEventBatch[] = [];
    const queue = new WebResearchEventQueue({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
      },
      transport: {
        send: (batch) => {
          batches.push(batch);
        },
      },
      batching: {
        batchSize: Number.NaN,
        flushIntervalMs: Number.POSITIVE_INFINITY,
      },
    });

    queue.enqueue({ name: "event.one", payload: {} }, "manual");
    vi.advanceTimersByTime(1_000);

    await queue.flush("manual_flush");
    expect(batches).toHaveLength(1);
    expect(batches[0]?.events.map((event) => event.name)).toEqual(["event.one"]);
  });

  it("allows retrying complete after transient complete callback failure", async () => {
    const completionAttempts: WebResearchTransportCompletePayload[] = [];
    let shouldFailCompletion = true;
    const queue = new WebResearchEventQueue({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
      },
      transport: {
        send: () => undefined,
        complete: async (payload) => {
          completionAttempts.push(payload);
          if (shouldFailCompletion) {
            shouldFailCompletion = false;
            throw new Error("transient complete failure");
          }
        },
      },
      batching: {
        batchSize: 10,
        flushIntervalMs: 0,
      },
    });

    queue.enqueue({ name: "event.one", payload: {} }, "manual");
    await expect(queue.complete("complete_once")).rejects.toThrow("transient complete failure");

    await queue.complete("complete_twice");

    expect(completionAttempts).toHaveLength(2);
    expect(completionAttempts[0]).toMatchObject({ reason: "complete_once" });
    expect(completionAttempts[1]).toMatchObject({ reason: "complete_twice" });
    expect(queue.getSnapshot()).toMatchObject({ bufferedEvents: 0 });
  });
});

describe("DefaultWebResearchClient", () => {
  it("emits transport completion once when manual and browser queues both complete", async () => {
    document.body.innerHTML = `<button data-testid="once-complete">Complete once</button>`;

    const completions: WebResearchTransportCompletePayload[] = [];
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: createCallbackTransport({
        onBatch: () => undefined,
        onComplete: (payload) => {
          completions.push(payload);
        },
      }),
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    await client.track({ name: "manual.event", payload: {} });
    const session = client.startBrowserSession({ captureInitialNavigation: false });
    (document.querySelector("button") as HTMLButtonElement).click();

    await client.complete("all_done");

    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ reason: "all_done" });
    expect(session.getSnapshot()).toMatchObject({ active: false });
  });

  it("swallows destroy teardown rejections to avoid unhandled promises", async () => {
    const unhandledRejectionHandler = vi.fn();
    const listener = (event: PromiseRejectionEvent) => {
      unhandledRejectionHandler(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", listener);

    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: {
        send: () => undefined,
        complete: async () => {
          throw new Error("teardown failure");
        },
      },
    });

    await client.track({ name: "manual.event", payload: {} });
    client.destroy("destroy");
    await Promise.resolve();
    await Promise.resolve();

    expect(unhandledRejectionHandler).not.toHaveBeenCalled();
    window.removeEventListener("unhandledrejection", listener);
  });

  it("emits completion once per distinct transport when manual and browser transports differ", async () => {
    document.body.innerHTML = `<button data-testid="multi-transport">Multi transport</button>`;

    const manualCompletions: WebResearchTransportCompletePayload[] = [];
    const browserCompletions: WebResearchTransportCompletePayload[] = [];
    const manualTransport = createCallbackTransport({
      onBatch: () => undefined,
      onComplete: (payload) => {
        manualCompletions.push(payload);
      },
    });
    const browserTransport = createCallbackTransport({
      onBatch: () => undefined,
      onComplete: (payload) => {
        browserCompletions.push(payload);
      },
    });
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: manualTransport,
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    await client.track({ name: "manual.event", payload: {} });
    client.startBrowserSession({ transport: browserTransport, captureInitialNavigation: false });
    (document.querySelector("button") as HTMLButtonElement).click();

    await client.complete("mixed_complete");

    expect(manualCompletions).toHaveLength(1);
    expect(browserCompletions).toHaveLength(1);
    expect(manualCompletions[0]).toMatchObject({ reason: "mixed_complete" });
    expect(browserCompletions[0]).toMatchObject({ reason: "mixed_complete" });
  });

  it("attempts both queue completions even when one fails", async () => {
    document.body.innerHTML = `<button data-testid="complete-robust">Complete robust</button>`;

    const manualComplete = vi.fn(async () => {
      throw new Error("manual complete failed");
    });
    const browserComplete = vi.fn(async () => undefined);
    const client = createWebResearchClient({
      apiKey: "test-key",
      transport: {
        send: () => undefined,
        complete: manualComplete,
      },
      batching: {
        batchSize: 50,
        flushIntervalMs: 0,
      },
    });

    await client.track({ name: "manual.event", payload: {} });
    client.startBrowserSession({
      transport: {
        send: () => undefined,
        complete: browserComplete,
      },
      captureInitialNavigation: false,
    });
    (document.querySelector("button") as HTMLButtonElement).click();

    await expect(client.complete("robust_complete")).rejects.toThrow("manual complete failed");
    expect(manualComplete).toHaveBeenCalledTimes(1);
    expect(browserComplete).toHaveBeenCalledTimes(1);
  });
});
