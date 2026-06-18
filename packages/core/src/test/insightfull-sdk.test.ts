import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateTriggers } from "../evaluation-engine/evaluation-engine.js";
import { buildContextPayload, renderStudy } from "../iframe-renderer/iframe-renderer.js";
import { InsightfullSDK } from "../insightfull-sdk.js";

// Mock config fetcher to return a test config
vi.mock("../config-fetcher/config-fetcher.js", () => ({
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
vi.mock("../telemetry-sender/telemetry-sender.js", () => ({
  sendTelemetry: vi.fn().mockResolvedValue({ ingested: 1 }),
}));

// Mock iframe-renderer to capture calls
vi.mock("../iframe-renderer/iframe-renderer.js", async () => {
  const actual = await vi.importActual<typeof import("../iframe-renderer/iframe-renderer.js")>(
    "../iframe-renderer/iframe-renderer.js",
  );
  return {
    ...actual,
    renderStudy: vi.fn(),
  };
});

// Mock evaluation-engine for trigger testing
vi.mock("../evaluation-engine/evaluation-engine.js", () => ({
  evaluateTriggers: vi.fn().mockReturnValue(null),
  setCooldown: vi.fn(),
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

  describe("onStudyTrigger", () => {
    const mockStudy = {
      id: 1,
      title: "Test Study",
      shareUrl: "share/test-study",
      branding: { logoUrl: null, organizationName: "Test Org", theme: null },
      sections: [],
      experienceMode: "interview",
      triggers: [],
      type: "ai_study",
    };

    beforeEach(() => {
      vi.mocked(evaluateTriggers).mockReturnValue(mockStudy);
    });

    it("calls onStudyTrigger callback when trigger matches", async () => {
      const onStudyTrigger = vi.fn();
      const sdk = InsightfullSDK.init({
        clientId: "env_test",
        autoTrack: false,
        onStudyTrigger,
      });

      // Wait for config to load
      await vi.waitFor(() => {
        expect(sdk.queueSize).toBeGreaterThanOrEqual(0);
      });

      sdk.track("test_event", { foo: "bar" });

      expect(onStudyTrigger).toHaveBeenCalledTimes(1);

      const callArg = onStudyTrigger.mock.calls[0]?.[0];
      expect(callArg).toBeDefined();
      expect(callArg.study).toBe(mockStudy);
      expect(callArg.iframeUrl).toContain("/study/share/test-study?ctx=");
      // Decode the URI-encoded base64 payload to verify it contains the expected fields
      const url = new URL(callArg.iframeUrl);
      const ctxParam = url.searchParams.get("ctx");
      expect(ctxParam).toBeTruthy();
      const decoded = JSON.parse(atob(ctxParam!));
      expect(decoded.source).toBe("web_sdk");
      expect(callArg.context).toEqual(
        expect.objectContaining({
          source: "web_sdk",
          triggerEvent: "test_event",
          sdkEnvironmentId: "env_test",
        }),
      );

      void sdk.destroy();
    });

    it("renders default overlay when onStudyTrigger is not provided", async () => {
      const sdk = InsightfullSDK.init({
        clientId: "env_test",
        autoTrack: false,
      });

      // Wait for config to load
      await vi.waitFor(() => {
        expect(sdk.queueSize).toBeGreaterThanOrEqual(0);
      });

      sdk.track("test_event", { foo: "bar" });

      expect(vi.mocked(renderStudy)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(renderStudy)).toHaveBeenCalledWith(
        "https://app.insightfull.ai",
        mockStudy,
        expect.objectContaining({
          source: "web_sdk",
          triggerEvent: "test_event",
        }),
      );

      void sdk.destroy();
    });
  });

  describe("buildContextPayload", () => {
    it("produces valid base64-encoded context", () => {
      const context = {
        visitorId: "v-123",
        userId: "u-456",
        customId: { email: "test@example.com" },
        customAttributes: { plan: "pro" },
        sdkEnvironmentId: "env_test",
        source: "web_sdk" as const,
        triggerEvent: "page_viewed",
      };

      const payload = buildContextPayload(context);

      // Should be valid base64
      expect(() => atob(payload)).not.toThrow();

      // Decoded payload should contain the original JSON
      const decoded = JSON.parse(atob(payload));
      expect(decoded.visitorId).toBe("v-123");
      expect(decoded.userId).toBe("u-456");
      expect(decoded.source).toBe("web_sdk");
    });
  });
});
