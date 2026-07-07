/**
 * React SDK wrapper tests.
 */
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsightfullStudyRenderer } from "@insightfull/web-research-sdk";
import { InsightfullProvider, useInsightfull } from "./provider.js";

const sdkMocks = vi.hoisted(() => {
  const instance = {
    identify: vi.fn<(userId: string, traits?: Record<string, unknown>) => void>(),
    track: vi.fn<(eventName: string, payload?: Record<string, unknown>) => void>(),
    destroy: vi.fn<() => Promise<void>>(),
    setAttribute: vi.fn<(key: string, value: unknown) => void>(),
    setCustomId: vi.fn<(key: string, value: string) => void>(),
  };

  return {
    init: vi.fn(() => instance),
    instance,
  };
});

vi.mock("@insightfull/web-research-sdk", () => ({
  InsightfullSDK: {
    init: sdkMocks.init,
  },
}));

const mockedInit = sdkMocks.init;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <InsightfullProvider clientId="env_test">{children}</InsightfullProvider>;
}

describe("InsightfullProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children immediately (SSR-safe)", () => {
    const { container } = render(
      <InsightfullProvider clientId="env_test">hello</InsightfullProvider>,
    );
    expect(container.textContent).toBe("hello");
  });

  it("initializes SDK with clientId", async () => {
    render(<InsightfullProvider clientId="env_abc"> </InsightfullProvider>);

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledWith(expect.objectContaining({ clientId: "env_abc" }));
    });
  });

  it("passes options through to SDK", async () => {
    render(
      <InsightfullProvider clientId="env_test" options={{ autoTrack: false }}>
        {" "}
      </InsightfullProvider>,
    );

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledWith(expect.objectContaining({ autoTrack: false }));
    });
  });

  it("passes a custom study renderer option through to SDK", async () => {
    const renderStudy = vi.fn<InsightfullStudyRenderer>();

    render(
      <InsightfullProvider clientId="env_test" options={{ renderStudy }}>
        {" "}
      </InsightfullProvider>,
    );

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledWith(expect.objectContaining({ renderStudy }));
    });
  });

  it("only initializes SDK once (double-mount guard)", async () => {
    const { rerender } = render(<InsightfullProvider clientId="env_test"> </InsightfullProvider>);

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    rerender(<InsightfullProvider clientId="env_test"> </InsightfullProvider>);

    expect(mockedInit).toHaveBeenCalledTimes(1);
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
    expect(sdkMocks.instance.track).toHaveBeenCalledWith("test_event");
  });
});
