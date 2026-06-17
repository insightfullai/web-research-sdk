/**
 * React SDK wrapper tests.
 *
 * These tests verify SSR safety, context propagation, and SDK lifecycle
 * within the React tree.
 */

import { cleanup, render, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightfullProvider, useInsightfull } from "./provider.js";

// ── Mocks ──

vi.mock("@insightfull/web-research-sdk", () => ({
  InsightfullSDK: {
    init: vi.fn(() => ({
      identify: vi.fn(),
      track: vi.fn(),
      destroy: vi.fn(),
      setAttribute: vi.fn(),
      setCustomId: vi.fn(),
      baseApiUrl: "https://app.insightfull.ai",
      currentVisitorId: "mock-visitor-id",
      userId: null,
      currentCustomIds: {},
      currentAttributes: {},
      queueSize: 0,
      hasActiveFlushTimer: false,
      hasActiveAutoTracker: false,
    })),
  },
}));

const { InsightfullSDK } = await vi.importMock<
  typeof import("@insightfull/web-research-sdk")
>("@insightfull/web-research-sdk");

// ── Helpers ──

function Wrapper({ children }: { children: ReactNode }) {
  return createElement(InsightfullProvider, { clientId: "env_test" }, children);
}

// ── Tests ──

describe("InsightfullProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children immediately (SSR-safe)", () => {
    const { container } = render(
      createElement(InsightfullProvider, { clientId: "env_test" }, "hello"),
    );
    expect(container.textContent).toBe("hello");
  });

  it("initializes SDK with clientId", async () => {
    render(createElement(InsightfullProvider, { clientId: "env_abc" }, null));

    // useEffect runs after render in testing-library
    await vi.waitFor(() => {
      expect(InsightfullSDK.init).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "env_abc" }),
      );
    });
  });

  it("passes options through to SDK", async () => {
    render(
      createElement(
        InsightfullProvider,
        { clientId: "env_test", options: { autoTrack: false } },
        null,
      ),
    );

    await vi.waitFor(() => {
      expect(InsightfullSDK.init).toHaveBeenCalledWith(
        expect.objectContaining({ autoTrack: false }),
      );
    });
  });

  it("only initializes SDK once (double-mount guard)", async () => {
    const { rerender } = render(
      createElement(InsightfullProvider, { clientId: "env_test" }, null),
    );

    await vi.waitFor(() => {
      expect(InsightfullSDK.init).toHaveBeenCalledTimes(1);
    });

    rerender(
      createElement(InsightfullProvider, { clientId: "env_test" }, null),
    );

    expect(InsightfullSDK.init).toHaveBeenCalledTimes(1);
  });
});

describe("useInsightfull", () => {
  it("returns null sdk before initialization (SSR)", () => {
    const { result } = renderHook(() => useInsightfull());
    expect(result.current.sdk).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it("returns initialized sdk inside provider", async () => {
    const { result } = renderHook(() => useInsightfull(), {
      wrapper: Wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.sdk).not.toBeNull();
    });
  });

  it("allows calling SDK methods from the hook", async () => {
    const { result } = renderHook(() => useInsightfull(), {
      wrapper: Wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    result.current.sdk!.track("test_event");
    expect(result.current.sdk!.track).toHaveBeenCalledWith("test_event");
  });
});
