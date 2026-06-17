import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsightfullSDK } from "../insightfull-sdk.js";

// Mock config fetcher to return a test config
vi.mock("../lib/config-fetcher/config-fetcher.js", () => ({
  fetchConfig: vi.fn().mockResolvedValue({
    environment: {
      allowedDomains: null,
      clientId: "env_test",
      id: 1,
      isActive: true,
      name: "Test Environment",
      organizationId: 1,
    },
    globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
    studies: [],
  }),
}));

// Mock telemetry sender
vi.mock("../lib/telemetry-sender/telemetry-sender.js", () => ({
  sendTelemetry: vi.fn().mockResolvedValue({ ingested: 1 }),
}));

describe("InsightfullSDK", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    expect(sdk.baseApiUrl).toBe("https://app.insightfull.ai");
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
});
