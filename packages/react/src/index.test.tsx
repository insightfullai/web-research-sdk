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
    ready: vi.fn<() => Promise<void>>(),
    status: "ready" as "destroyed" | "initializing" | "ready" | "unavailable",
    initializationError: null as Error | null,
  };

  return {
    init: vi.fn(() => instance),
    instance,
  };
});

vi.mock("@insightfull/web-research-sdk", () => ({
  InsightfullInitializationError: class InsightfullInitializationError extends Error {},
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
    sdkMocks.instance.ready.mockResolvedValue();
    sdkMocks.instance.status = "ready";
    sdkMocks.instance.initializationError = null;
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

  it("does not reinitialize for equivalent inline option values", async () => {
    const { rerender } = render(
      <InsightfullProvider clientId="env_test" options={{ autoTrack: false }}>
        {" "}
      </InsightfullProvider>,
    );

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    rerender(
      <InsightfullProvider clientId="env_test" options={{ autoTrack: false }}>
        {" "}
      </InsightfullProvider>,
    );

    expect(mockedInit).toHaveBeenCalledTimes(1);
    expect(sdkMocks.instance.destroy).not.toHaveBeenCalled();
  });

  it("destroys and reinitializes when the client ID changes", async () => {
    const { rerender } = render(<InsightfullProvider clientId="env_first"> </InsightfullProvider>);
    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    rerender(<InsightfullProvider clientId="env_second"> </InsightfullProvider>);

    await vi.waitFor(() => {
      expect(sdkMocks.instance.destroy).toHaveBeenCalledTimes(1);
      expect(mockedInit).toHaveBeenCalledTimes(2);
    });
    expect(mockedInit).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientId: "env_second" }),
    );
  });

  it("reinitializes when an appearance value changes", async () => {
    const { rerender } = render(
      <InsightfullProvider clientId="env_test" options={{ appearance: { accentColor: "#0f766e" } }}>
        {" "}
      </InsightfullProvider>,
    );
    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    rerender(
      <InsightfullProvider clientId="env_test" options={{ appearance: { accentColor: "#7c3aed" } }}>
        {" "}
      </InsightfullProvider>,
    );

    await vi.waitFor(() => {
      expect(sdkMocks.instance.destroy).toHaveBeenCalledTimes(1);
      expect(mockedInit).toHaveBeenCalledTimes(2);
    });
  });

  it("destroys the SDK when the provider unmounts", async () => {
    const { unmount } = render(<InsightfullProvider clientId="env_test"> </InsightfullProvider>);
    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(sdkMocks.instance.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("useInsightfull", () => {
  it("returns null sdk before initialization (SSR)", () => {
    const { result } = renderHook(() => useInsightfull());
    expect(result.current.sdk).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("returns initialized sdk inside provider", async () => {
    const { result } = renderHook(() => useInsightfull(), {
      wrapper: Wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.sdk).not.toBeNull();
      expect(result.current.status).toBe("ready");
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

  it("exposes an unavailable configuration without hiding the SDK instance", async () => {
    const unavailableError = new Error("Environment unavailable");
    sdkMocks.instance.status = "unavailable";
    sdkMocks.instance.initializationError = unavailableError;
    sdkMocks.instance.ready.mockRejectedValueOnce(unavailableError);

    const { result } = renderHook(() => useInsightfull(), {
      wrapper: Wrapper,
    });

    await vi.waitFor(() => {
      expect(result.current.status).toBe("unavailable");
    });
    expect(result.current.sdk).not.toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBe(unavailableError);
  });
});
