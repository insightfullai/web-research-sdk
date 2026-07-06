/**
 * Edge case tests — covers boundary conditions across all SDK modules.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoTracker } from "../auto-tracker/auto-tracker.js";
import { fetchConfig } from "../config-fetcher/config-fetcher.js";
import {
  evaluateTriggers,
  isCooldownExpired,
  matchesFilter,
  setCooldown,
} from "../evaluation-engine/evaluation-engine.js";
import { EventQueue } from "../event-queue/event-queue.js";
import {
  buildContextPayload,
  removeStudy,
  renderStudy,
} from "../iframe-renderer/iframe-renderer.js";
import type {
  GlobalSettings,
  SdkContext,
  SdkEvent,
  StudyContent,
  TriggerFilter,
} from "../types/index.js";

// ──── Helpers ────

const defaultGlobalSettings: GlobalSettings = {
  cooldownDays: 14,
  sessionTimeoutMs: 1_800_000,
};

function makeStudy(overrides: Partial<StudyContent> = {}): StudyContent {
  return {
    id: 1,
    shareUrl: "study-abc",
    title: "Test Study",
    type: "interview",
    experienceMode: "interview",
    sections: [],
    branding: { logoUrl: null, organizationName: "Test Org", theme: null },
    triggers: [
      {
        eventName: "checkout_completed",
        filters: [],
        isActive: true,
        priority: 0,
      },
    ],
    ...overrides,
  };
}

function makeContext(overrides: Partial<SdkContext> = {}): SdkContext {
  return {
    visitorId: "visitor-123",
    userId: null,
    customId: {},
    customAttributes: {},
    sdkEnvironmentId: "env_abc",
    sdkVersion: "1.0.0",
    source: "web_sdk",
    triggerEvent: "test_event",
    ...overrides,
  };
}

function makeEvent(type: SdkEvent["type"] = "event"): SdkEvent {
  return { type, timestamp: Date.now() };
}

// ═══════════════════════════════════════════
// 1. Evaluation engine edge cases
// ═══════════════════════════════════════════

describe("Evaluation edge cases", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when all studies have empty triggers arrays", () => {
    const studyA = makeStudy({ id: 1, triggers: [] });
    const studyB = makeStudy({ id: 2, triggers: [] });
    const result = evaluateTriggers(
      "checkout_completed",
      {},
      {},
      [studyA, studyB],
      defaultGlobalSettings,
    );
    expect(result).toBeNull();
  });

  it("returns null when triggers array is empty (no match)", () => {
    const study = makeStudy({ triggers: [] });
    const result = evaluateTriggers("anything", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBeNull();
  });

  it("multiple matching triggers → highest priority study wins", () => {
    const low = makeStudy({
      id: 10,
      triggers: [
        {
          eventName: "pageview",
          filters: [],
          isActive: true,
          priority: 1,
        },
      ],
    });
    const mid = makeStudy({
      id: 20,
      triggers: [
        {
          eventName: "pageview",
          filters: [],
          isActive: true,
          priority: 5,
        },
      ],
    });
    const high = makeStudy({
      id: 30,
      triggers: [
        {
          eventName: "pageview",
          filters: [],
          isActive: true,
          priority: 10,
        },
      ],
    });

    // Supply in random order
    const result = evaluateTriggers("pageview", {}, {}, [mid, low, high], defaultGlobalSettings);
    expect(result?.id).toBe(30);
  });

  it("trigger with no filters matches on event name only", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "signup",
          filters: [],
          isActive: true,
          priority: 0,
        },
      ],
    });

    // Should match regardless of attributes
    expect(evaluateTriggers("signup", { foo: "bar" }, {}, [study], defaultGlobalSettings)).toBe(
      study,
    );
    expect(evaluateTriggers("signup", {}, { id: "x" }, [study], defaultGlobalSettings)).toBe(study);
  });

  it("nested property access with array index resolves correctly", () => {
    // The resolveProperty function splits on "." and walks the object.
    // Numeric keys should work for plain objects with those keys.
    const filter: TriggerFilter = {
      property: "items.0.name",
      operator: "equals",
      value: "Widget",
    };
    const attrs = {
      items: { "0": { name: "Widget" } },
    };
    expect(matchesFilter(filter, attrs, {})).toBe(true);
  });

  it("filter on non-existent property — exists returns false", () => {
    const filter: TriggerFilter = {
      property: "nonexistent",
      operator: "exists",
    };
    expect(matchesFilter(filter, {}, {})).toBe(false);
  });

  it("filter on non-existent property — equals returns false", () => {
    const filter: TriggerFilter = {
      property: "nonexistent",
      operator: "equals",
      value: "anything",
    };
    expect(matchesFilter(filter, {}, {})).toBe(false);
  });

  it("case sensitivity in event names — exact match required", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "Checkout_Completed",
          filters: [],
          isActive: true,
          priority: 0,
        },
      ],
    });

    expect(
      evaluateTriggers("checkout_completed", {}, {}, [study], defaultGlobalSettings),
    ).toBeNull();

    expect(evaluateTriggers("Checkout_Completed", {}, {}, [study], defaultGlobalSettings)).toBe(
      study,
    );
  });

  it("resolveProperty returns undefined for null intermediate value", () => {
    const filter: TriggerFilter = {
      property: "user.plan",
      operator: "equals",
      value: "pro",
    };
    expect(matchesFilter(filter, { user: null }, {})).toBe(false);
  });

  it("resolveProperty returns undefined for primitive intermediate value", () => {
    const filter: TriggerFilter = {
      property: "user.plan",
      operator: "equals",
      value: "pro",
    };
    expect(matchesFilter(filter, { user: "string_value" }, {})).toBe(false);
  });

  it("resolveProperty handles deeply nested missing keys", () => {
    const filter: TriggerFilter = {
      property: "a.b.c.d.e",
      operator: "exists",
    };
    expect(matchesFilter(filter, { a: { b: {} } }, {})).toBe(false);
  });

  it("cooldown returns true when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Access denied");
    });

    expect(isCooldownExpired(1, 14)).toBe(true);
    spy.mockRestore();
  });

  it("setCooldown silently fails when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });

    expect(() => setCooldown(1)).not.toThrow();
    spy.mockRestore();
  });
});

// ═══════════════════════════════════════════
// 2. Queue edge cases
// ═══════════════════════════════════════════

describe("Queue edge cases", () => {
  it("clear during active flush → queue is emptied", async () => {
    let flushResolve: (() => void) | undefined;
    const onFlush = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          flushResolve = resolve;
        }),
    );

    const queue = new EventQueue({
      maxSize: 100,
      batchSize: 5,
      onFlush,
    });

    queue.push(makeEvent());
    queue.push(makeEvent());
    queue.push(makeEvent());

    const flushPromise = queue.flush();

    // Clear while flush is in progress
    queue.clear();
    expect(queue.size()).toBe(0);

    // Resolve the pending flush so the promise doesn't hang
    flushResolve?.();
    await flushPromise;
  });

  it("events added after destroy (simulated) are silently dropped", () => {
    // Simulate the "destroyed" pattern the SDK uses
    let destroyed = false;
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new EventQueue({
      maxSize: 100,
      batchSize: 5,
      onFlush,
    });

    // SDK pattern: check destroyed flag before push
    function guardedPush(event: SdkEvent): void {
      if (destroyed) {
        return;
      }
      queue.push(event);
    }

    guardedPush(makeEvent());
    guardedPush(makeEvent());
    expect(queue.size()).toBe(2);

    destroyed = true;
    guardedPush(makeEvent()); // Should be silently dropped
    expect(queue.size()).toBe(2);
  });

  it("zero-length batch → no network call", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const queue = new EventQueue({
      maxSize: 100,
      batchSize: 5,
      onFlush,
    });

    // Queue is empty
    await queue.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("flush retries after initial failure then succeeds", async () => {
    let callCount = 0;
    const queue = new EventQueue({
      maxSize: 100,
      batchSize: 10,
      onFlush: () => {
        callCount++;
        if (callCount <= 1) {
          throw new Error("Transient failure");
        }
      },
    });

    for (let i = 0; i < 2; i++) {
      queue.push(makeEvent());
    }

    // First flush fails — events re-queued
    await queue.flush();
    expect(queue.size()).toBe(2);

    // Second flush succeeds
    await queue.flush();
    expect(queue.size()).toBe(0);
    expect(callCount).toBe(2);
  });

  it("maxSize of 1 — only the latest event is kept", async () => {
    const flushed: SdkEvent[][] = [];
    const queue = new EventQueue({
      maxSize: 1,
      batchSize: 10,
      onFlush: (batch) => {
        flushed.push(batch);
      },
    });

    queue.push({ type: "event", timestamp: 1 });
    queue.push({ type: "event", timestamp: 2 });
    queue.push({ type: "event", timestamp: 3 });

    expect(queue.size()).toBe(1);
    await queue.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]![0]!.timestamp).toBe(3);
  });
});

// ═══════════════════════════════════════════
// 3. iframe renderer edge cases
// ═══════════════════════════════════════════

describe("iframe edge cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("multiple rapid show() calls for same study → only one iframe in DOM", () => {
    const study = makeStudy({ id: 1 });
    const context = makeContext();

    renderStudy("https://insightfull.ai", study, context);
    renderStudy("https://insightfull.ai", study, context);
    renderStudy("https://insightfull.ai", study, context);

    const elements = document.querySelectorAll("#insightfull-study-1");
    expect(elements.length).toBe(1);
  });

  it("show() after removeStudy() → creates new iframe", () => {
    const study = makeStudy({ id: 5 });
    const context = makeContext();

    renderStudy("https://insightfull.ai", study, context);
    expect(document.getElementById("insightfull-study-5")).not.toBeNull();

    removeStudy(5);
    expect(document.getElementById("insightfull-study-5")).toBeNull();

    renderStudy("https://insightfull.ai", study, context);
    expect(document.getElementById("insightfull-study-5")).not.toBeNull();
  });

  it("study with very long title → context payload handles it", () => {
    const longTitle = "A".repeat(10_000);
    const study = makeStudy({ id: 1, title: longTitle });
    const context = makeContext();

    const host = renderStudy("https://insightfull.ai", study, context);
    expect(host).toBeDefined();

    const iframe = host.querySelector("iframe");
    expect(iframe?.getAttribute("title")).toBe(longTitle);

    // Verify context payload is still valid
    const src = iframe?.src ?? "";
    const ctxParam = src.split("ctx=")[1]!;
    expect(ctxParam).toBeDefined();

    const decoded = JSON.parse(atob(ctxParam));
    expect(decoded.visitorId).toBe("visitor-123");
  });

  it("context with unicode values encodes and round-trips correctly", () => {
    const context = makeContext({
      customAttributes: { name: "日本語テスト", emoji: "🎉" },
    });
    const payload = buildContextPayload(context);

    // Decode using the same approach as the SDK's fallback:
    // btoa(TextEncoder bytes) -> atob -> TextDecoder
    const binaryString = atob(payload);
    const bytes = Uint8Array.from(binaryString, (char) => {
      const cp = char.codePointAt(0);
      return cp ?? 0;
    });
    const json = new TextDecoder().decode(bytes);
    const decoded = JSON.parse(json);
    expect(decoded.customAttributes.name).toBe("日本語テスト");
    expect(decoded.customAttributes.emoji).toBe("🎉");
  });

  it("removeStudy on non-existent id is a safe no-op", () => {
    expect(() => {
      removeStudy(99_999);
      removeStudy(0);
      removeStudy(-1);
    }).not.toThrow();
  });

  it("iframe src uses correct apiBase", () => {
    const study = makeStudy({ shareUrl: "my-study" });
    const context = makeContext();

    renderStudy("https://custom.example.com", study, context);

    const iframe = document.querySelector("iframe");
    expect(iframe?.src).toContain("https://custom.example.com/study/my-study?ctx=");
  });
});

// ═══════════════════════════════════════════
// 4. Auto-tracker edge cases
// ═══════════════════════════════════════════

describe("Auto-tracker edge cases", () => {
  let tracker: AutoTracker;
  let trackedEvents: Array<{
    eventName: string;
    payload?: Record<string, unknown>;
  }>;
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    originalPushState = history.pushState.bind(history);
    originalReplaceState = history.replaceState.bind(history);
    trackedEvents = [];
    tracker = new AutoTracker((eventName, payload) => {
      trackedEvents.push(payload !== undefined ? { eventName, payload } : { eventName });
    });
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    tracker.stop();
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  it("pushState with same URL → still tracked", () => {
    tracker.start();
    trackedEvents.length = 0;

    history.pushState({}, "", "/same");
    expect(trackedEvents).toHaveLength(1);

    // Push same URL again
    history.pushState({}, "", "/same");
    expect(trackedEvents).toHaveLength(2);
  });

  it("multiple rapid navigation events → all tracked", () => {
    tracker.start();
    trackedEvents.length = 0;

    const paths = ["/a", "/b", "/c", "/d", "/e"];
    for (const path of paths) {
      history.pushState({}, "", path);
    }

    expect(trackedEvents).toHaveLength(5);
    expect(trackedEvents.map((e) => e.payload?.path)).toEqual(paths);
  });

  it("track callback receives correct event name for all navigation types", () => {
    tracker.start();
    trackedEvents.length = 0;

    history.pushState({}, "", "/push");
    history.replaceState({}, "", "/replace");

    expect(trackedEvents).toHaveLength(2);
    expect(trackedEvents.every((e) => e.eventName === "pageview")).toBe(true);
  });

  it("URL in payload reflects current location after navigation", () => {
    tracker.start();
    trackedEvents.length = 0;

    history.pushState({}, "", "/test-page");

    expect(trackedEvents).toHaveLength(1);
    expect(trackedEvents[0]!.payload?.url).toContain("/test-page");
  });

  it("calling stop multiple times does not throw", () => {
    tracker.start();
    tracker.stop();

    // Restore so afterEach doesn't double-restore
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    expect(() => tracker.stop()).not.toThrow();
  });

  it("calling start multiple times re-tracks initial pageview", () => {
    tracker.start();
    expect(trackedEvents).toHaveLength(1);

    // Calling start again will track another initial pageview and re-intercept
    tracker.start();
    expect(trackedEvents).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// 5. Config fetcher edge cases
// ═══════════════════════════════════════════

describe("Config fetcher edge cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("empty studies array → valid config with no triggers", async () => {
    const emptyConfig = {
      environment: {
        allowedDomains: null,
        clientId: "env_abc",
        id: 1,
        isActive: true,
        name: "Test",
        organizationId: 1,
      },
      globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
      studies: [],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: emptyConfig } }),
    } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toEqual(emptyConfig);
    expect(result?.studies).toEqual([]);
  });

  it("all studies paused (inactive triggers) → config returned but no matches", async () => {
    const pausedConfig = {
      environment: {
        allowedDomains: null,
        clientId: "env_abc",
        id: 1,
        isActive: true,
        name: "Test",
        organizationId: 1,
      },
      globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
      studies: [
        {
          id: 1,
          shareUrl: "paused-study",
          title: "Paused",
          type: "interview",
          experienceMode: "interview",
          sections: [],
          branding: {
            logoUrl: null,
            organizationName: "Test Org",
            theme: null,
          },
          triggers: [
            {
              eventName: "click",
              filters: [],
              isActive: false,
              priority: 0,
            },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: pausedConfig } }),
    } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toEqual(pausedConfig);

    // Verify evaluation returns null for inactive triggers
    localStorage.clear();
    const matchResult = evaluateTriggers(
      "click",
      {},
      {},
      result?.studies ?? [],
      result?.globalSettings ?? defaultGlobalSettings,
    );
    expect(matchResult).toBeNull();
  });

  it("malformed response (missing result.data) → falls back to raw json", async () => {
    const rawConfig = {
      globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
      studies: [],
    };

    // Response without tRPC wrapper
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => rawConfig,
    } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toEqual(rawConfig);
  });

  it("malformed response (null body) → graceful degradation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => null,
    } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    // Should return null (the data field is null)
    expect(result).toBeNull();
  });

  it("network error on all retries → returns null gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toBeNull();
  });

  it("mixed retry scenario: failure then success", async () => {
    const config = {
      globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
      studies: [],
    };

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: { data: config } }),
      } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toEqual(config);
  });

  it("includes correct query parameters in URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          data: {
            globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
            studies: [],
          },
        },
      }),
    } as Response);

    await fetchConfig("https://insightfull.ai", "client-xyz");

    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/trpc/sdk.getSdkConfig?");
    expect(calledUrl).toContain("client-xyz");
  });

  it("handles HTTP 429 rate limit as non-retryable (4xx)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    const result = await fetchConfig("https://insightfull.ai", "env_abc");

    expect(result).toBeNull();
  });
});
