/**
 * React SDK wrapper tests.
 */
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightfullProvider, useInsightfull } from "./provider.js";

vi.mock("@insightfull/web-research-sdk", () => ({
  InsightfullSDK: {
    init: vi.fn(() => ({
      identify: vi.fn(),
      track: vi.fn(),
      destroy: vi.fn(),
      setAttribute: vi.fn(),
      setCustomId: vi.fn(),
    })),
  },
}));

const { InsightfullSDK } = await vi.importMock<typeof import("@insightfull/web-research-sdk")>(
  "@insightfull/web-research-sdk",
);

const mockedInit = vi.mocked(InsightfullSDK.init);

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

  it("only initializes SDK once (double-mount guard)", async () => {
    const { rerender } = render(<InsightfullProvider clientId="env_test"> </InsightfullProvider>);

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledTimes(1);
    });

    rerender(<InsightfullProvider clientId="env_test"> </InsightfullProvider>);

    expect(mockedInit).toHaveBeenCalledTimes(1);
  });

  it("passes onStudyTrigger through to SDK init", async () => {
    const onStudyTrigger = vi.fn();

    render(
      <InsightfullProvider clientId="env_test" onStudyTrigger={onStudyTrigger}>
        {" "}
      </InsightfullProvider>,
    );

    await vi.waitFor(() => {
      expect(mockedInit).toHaveBeenCalledWith(expect.objectContaining({ onStudyTrigger }));
    });
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

    const mockTrack = vi.mocked(result.current.sdk!.track);
    result.current.sdk!.track("test_event");
    expect(mockTrack).toHaveBeenCalledWith("test_event");
  });
});
