import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConfig } from "../config-fetcher/config-fetcher.js";
import { InsightfullSDK } from "../insightfull-sdk.js";
import type { SdkConfig, StudyContent } from "../types/index.js";

// Mock config fetcher to return a test config
vi.mock("../config-fetcher/config-fetcher.js", () => ({
  fetchConfig: vi.fn(),
}));

// Mock telemetry sender
vi.mock("../telemetry-sender/telemetry-sender.js", () => ({
  sendTelemetry: vi.fn().mockResolvedValue({ ingested: 1 }),
}));

const mockedFetchConfig = vi.mocked(fetchConfig);

function makeStudy(overrides: Partial<StudyContent> = {}): StudyContent {
  return {
    id: 1,
    shareUrl: "test-study",
    title: "Test Study",
    type: "interview",
    experienceMode: "interview",
    sections: [],
    branding: {
      logoUrl: null,
      organizationName: "Test",
      theme: null,
    },
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

function makeConfig(studies: StudyContent[] = []): SdkConfig {
  return {
    environment: {
      allowedDomains: null,
      clientId: "env_test",
      isActive: true,
      name: "Test Environment",
    },
    globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
    studies,
  };
}

async function waitForSdkConfig(): Promise<void> {
  await vi.waitFor(() => {
    expect(mockedFetchConfig).toHaveBeenCalled();
  });

  const fetchResult = mockedFetchConfig.mock.results[0];
  if (fetchResult?.type === "return") {
    await fetchResult.value;
  }

  await Promise.resolve();
}

describe("InsightfullSDK", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.clearAllMocks();
    mockedFetchConfig.mockResolvedValue(makeConfig());
  });

  it("init creates an instance", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test" });
    expect(sdk).toBeInstanceOf(InsightfullSDK);
    void sdk.destroy();
  });

  it("identify sets userId and merges traits", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    sdk.identify("user-123", { plan: "pro" });

    expect(sdk.userId).toBe("user-123");
    void sdk.destroy();
  });

  it("setCustomId stores custom identifiers", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    sdk.setCustomId("email", "test@example.com");

    expect(sdk.currentCustomIds.email).toBe("test@example.com");
    void sdk.destroy();
  });

  it("setAttribute stores custom attributes", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    sdk.setAttribute("company", "Acme");

    expect(sdk.currentAttributes.company).toBe("Acme");
    void sdk.destroy();
  });

  it("track queues an event", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    sdk.track("button_clicked", { button: "signup" });

    expect(sdk.queueSize).toBe(1);
    void sdk.destroy();
  });

  it("destroy clears timers and stops tracking", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test" });
    void sdk.destroy();

    expect(sdk.hasActiveFlushTimer).toBe(false);
    expect(sdk.hasActiveAutoTracker).toBe(false);
  });

  it("does not accept calls after destroy", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    void sdk.destroy();

    // These should be no-ops
    sdk.identify("user");
    sdk.setCustomId("key", "value");
    sdk.setAttribute("key", "value");
    sdk.track("event");

    expect(sdk.queueSize).toBe(0);
  });

  it("creates a persistent visitor ID", () => {
    const sdk1 = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
    });
    const visitorId1 = sdk1.currentVisitorId;
    void sdk1.destroy();

    const sdk2 = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
    });
    const visitorId2 = sdk2.currentVisitorId;
    void sdk2.destroy();

    expect(visitorId1).toBe(visitorId2);
  });

  it("uses default apiBase when not specified", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    expect(sdk.baseApiUrl).toBe("https://insightfull.ai");
    void sdk.destroy();
  });

  it("accepts custom apiBase", () => {
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      apiBase: "https://custom.example.com",
      autoTrack: false,
    });
    expect(sdk.baseApiUrl).toBe("https://custom.example.com");
    void sdk.destroy();
  });

  it("uses default fixed iframe rendering when a trigger matches", async () => {
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([makeStudy({ shareUrl: "survey-alpha" })]));
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });

    await waitForSdkConfig();
    expect(mockedFetchConfig).toHaveBeenCalledWith("https://insightfull.ai", "env_test");

    sdk.track("checkout_completed", { total: 42 });

    const iframe = document.querySelector<HTMLIFrameElement>("#insightfull-study-1 iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("https://insightfull.ai/study/survey-alpha?ctx=");

    const encodedContext = new URL(iframe?.src ?? "https://example.invalid").searchParams.get(
      "ctx",
    );
    expect(encodedContext).not.toBeNull();
    expect(JSON.parse(atob(encodedContext ?? ""))).toMatchObject({
      sdkEnvironmentId: "env_test",
      sdkVersion: "1.0.0",
      source: "web_sdk",
      triggerEvent: "checkout_completed",
    });

    void sdk.destroy();
  });

  it("replays trigger evaluations that occur before config loads", async () => {
    let resolveConfig: (config: SdkConfig) => void;
    mockedFetchConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });

    sdk.track("checkout_completed");
    expect(document.querySelector("iframe")).toBeNull();

    resolveConfig!(makeConfig([makeStudy()]));
    await waitForSdkConfig();

    const iframe = document.querySelector<HTMLIFrameElement>("#insightfull-study-1 iframe");
    expect(iframe).not.toBeNull();
    const encodedContext = new URL(iframe?.src ?? "https://example.invalid").searchParams.get(
      "ctx",
    );
    expect(JSON.parse(atob(encodedContext ?? ""))).toMatchObject({
      triggerEvent: "checkout_completed",
    });

    void sdk.destroy();
  });
});
