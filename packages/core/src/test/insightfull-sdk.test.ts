import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { fetchConfig } from "../config-fetcher/config-fetcher.js";
import { InsightfullSDK } from "../insightfull-sdk.js";
import type { InsightfullStudyRenderer, SdkConfig, StudyContent } from "../types/index.js";

// Mock config fetcher to return a test config
vi.mock("../config-fetcher/config-fetcher.js", () => ({
  fetchConfig: vi.fn(),
}));

// Mock telemetry sender
vi.mock("../telemetry-sender/telemetry-sender.js", () => ({
  sendTelemetry: vi.fn().mockResolvedValue({ ingested: 1 }),
}));

const mockedFetchConfig = vi.mocked(fetchConfig);

const validHostContext = {
  scenario: { id: "northstar_checkout_v1", label: "Northstar checkout" },
  state: { checkoutStep: "review", promoEntryAvailable: true },
  surface: {
    id: "checkout_review",
    label: "Checkout review",
    routeTemplate: "/checkout",
  },
  task: { id: "apply_promo_code", label: "Apply a promotional code" },
  version: 1 as const,
};

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
      iframeBridge: {
        nonce: expect.any(String),
        version: 1,
      },
      sdkEnvironmentId: "env_test",
      sdkVersion: "1.0.0",
      source: "web_sdk",
      triggerEvent: "checkout_completed",
    });
    expect(sdk.getIframeBridgeState()).toMatchObject({
      active: true,
      ready: false,
      studyId: 1,
      targetOrigin: "https://insightfull.ai",
    });

    void sdk.destroy();
  });

  it("calls a custom renderer with iframeUrl, study, and context when a trigger matches", async () => {
    const study = makeStudy({
      id: 7,
      shareUrl: "custom-survey",
      title: "Custom Survey",
    });
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([study]));
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });
    sdk.identify("user-123", { plan: "pro" });
    sdk.setCustomId("account", "acct-123");

    await waitForSdkConfig();

    sdk.track("checkout_completed");

    expect(renderStudy).toHaveBeenCalledTimes(1);
    const [payload] = renderStudy.mock.calls[0] ?? [];
    expect(payload).toBeDefined();
    expect(payload?.study).toBe(study);
    expect(payload?.iframeUrl).toContain("https://insightfull.ai/study/custom-survey?ctx=");
    expect(payload?.registerIframeBridge).toEqual(expect.any(Function));
    expect(payload?.context).toMatchObject({
      visitorId: sdk.currentVisitorId,
      userId: "user-123",
      customId: { account: "acct-123" },
      customAttributes: { plan: "pro" },
      iframeBridge: {
        nonce: expect.any(String),
        version: 1,
      },
      sdkEnvironmentId: "env_test",
      sdkVersion: "1.0.0",
      source: "web_sdk",
      triggerEvent: "checkout_completed",
    });

    void sdk.destroy();
  });

  it("validates and passes explicit hostContext through the launch and iframe URL", async () => {
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([makeStudy()]));
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });
    await waitForSdkConfig();

    sdk.track("checkout_completed", undefined, {
      hostContext: validHostContext,
    });

    const payload = renderStudy.mock.calls[0]?.[0];
    expect(payload?.context.hostContext).toEqual(validHostContext);
    const encodedContext = new URL(
      payload?.iframeUrl ?? "https://example.invalid",
    ).searchParams.get("ctx");
    expect(JSON.parse(atob(encodedContext ?? ""))).toMatchObject({
      hostContext: validHostContext,
    });
    void sdk.destroy();
  });

  it("does not infer hostContext from identify traits, event payloads, URL, title, or DOM", async () => {
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([makeStudy()]));
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });
    sdk.identify("user-123", { hostContext: validHostContext });
    window.history.replaceState({}, "", "/checkout?private=true#fragment");
    document.title = "Northstar checkout";
    document.body.innerHTML = '<main data-scenario="northstar_checkout_v1">Checkout review</main>';
    await waitForSdkConfig();

    sdk.track("checkout_completed", { hostContext: validHostContext });

    expect(renderStudy.mock.calls[0]?.[0].context).not.toHaveProperty("hostContext");
    void sdk.destroy();
  });

  it("omits invalid hostContext without blocking an otherwise valid launch", async () => {
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([makeStudy()]));
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });
    await waitForSdkConfig();

    sdk.track("checkout_completed", undefined, {
      hostContext: {
        ...validHostContext,
        state: { promoCode: "SAVE20" },
      },
    });

    expect(renderStudy).toHaveBeenCalledTimes(1);
    expect(renderStudy.mock.calls[0]?.[0].context).not.toHaveProperty("hostContext");
    void sdk.destroy();
  });

  it("lets a custom renderer register an iframe bridge and cleanup the registration", async () => {
    const study = makeStudy({ id: 7, shareUrl: "custom-survey" });
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([study]));
    let cleanup: (() => void) | undefined;
    let iframe: HTMLIFrameElement | undefined;
    let nonce: string | undefined;
    let postMessage: MockInstance<Window["postMessage"]> | undefined;
    const renderStudy = vi.fn<InsightfullStudyRenderer>((payload) => {
      iframe = document.createElement("iframe");
      iframe.src = payload.iframeUrl;
      document.body.appendChild(iframe);
      nonce = payload.context.iframeBridge?.nonce;
      cleanup = payload.registerIframeBridge(iframe);
      postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {});
    });
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      apiBase: "https://iframe.example.com",
      autoTrack: false,
      renderStudy,
    });
    const message = {
      type: "insightfull.recording_event" as const,
      version: 1 as const,
      recordingSessionId: "session-1",
      format: "dom-event-stream",
      formatVersion: "1",
      event: { sequence: 1 },
    };

    await waitForSdkConfig();
    sdk.track("checkout_completed");
    expect(renderStudy).toHaveBeenCalledTimes(1);
    expect(sdk.getIframeBridgeState()).toMatchObject({
      active: true,
      ready: false,
      studyId: 7,
      targetOrigin: "https://iframe.example.com",
    });

    expect(sdk.sendIframeBridgeMessage(message)).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "insightfull.iframe_ready",
          version: 1,
          studyId: 7,
          nonce,
        },
        origin: "https://iframe.example.com",
        source: iframe?.contentWindow ?? null,
      }),
    );

    expect(postMessage).toHaveBeenCalledWith(message, "https://iframe.example.com");
    expect(postMessage?.mock.calls.map((call) => call[1] as unknown)).not.toContain("*");

    cleanup?.();

    expect(sdk.getIframeBridgeState()).toEqual({
      active: false,
      queueSize: 0,
      ready: false,
      studyId: null,
      targetOrigin: null,
    });
    expect(sdk.sendIframeBridgeMessage(message)).toBe(false);

    void sdk.destroy();
  });

  it("custom renderer cleanup does not unregister a newer study bridge", async () => {
    const firstStudy = makeStudy({
      id: 7,
      shareUrl: "first-survey",
      triggers: [{ eventName: "first_event", filters: [], isActive: true, priority: 0 }],
    });
    const secondStudy = makeStudy({
      id: 8,
      shareUrl: "second-survey",
      triggers: [{ eventName: "second_event", filters: [], isActive: true, priority: 0 }],
    });
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([firstStudy, secondStudy]));
    const registrations: Array<{
      cleanup: () => void;
      iframe: HTMLIFrameElement;
      nonce: string | undefined;
      postMessage: MockInstance<Window["postMessage"]>;
      studyId: number;
    }> = [];
    const renderStudy = vi.fn<InsightfullStudyRenderer>((payload) => {
      const iframe = document.createElement("iframe");
      iframe.src = payload.iframeUrl;
      document.body.appendChild(iframe);
      const cleanup = payload.registerIframeBridge(iframe);
      registrations.push({
        cleanup,
        iframe,
        nonce: payload.context.iframeBridge?.nonce,
        postMessage: vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => {}),
        studyId: payload.study.id,
      });
    });
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      apiBase: "https://iframe.example.com",
      autoTrack: false,
      renderStudy,
    });
    const message = {
      type: "insightfull.recording_event" as const,
      version: 1 as const,
      recordingSessionId: "session-1",
      format: "dom-event-stream",
      formatVersion: "1",
      event: { sequence: 1 },
    };

    await waitForSdkConfig();
    sdk.track("first_event");
    sdk.track("second_event");

    const [firstRegistration, secondRegistration] = registrations;
    expect(firstRegistration?.studyId).toBe(7);
    expect(secondRegistration?.studyId).toBe(8);
    if (!firstRegistration || !secondRegistration) {
      throw new Error("Expected custom renderer to register both study iframes");
    }
    expect(sdk.getIframeBridgeState()).toMatchObject({
      active: true,
      studyId: 8,
    });

    firstRegistration.cleanup();

    expect(sdk.getIframeBridgeState()).toMatchObject({
      active: true,
      studyId: 8,
    });
    expect(sdk.sendIframeBridgeMessage(message)).toBe(true);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "insightfull.iframe_ready",
          version: 1,
          studyId: 8,
          nonce: secondRegistration.nonce,
        },
        origin: "https://iframe.example.com",
        source: secondRegistration.iframe.contentWindow,
      }),
    );

    expect(firstRegistration.postMessage).not.toHaveBeenCalled();
    expect(secondRegistration.postMessage).toHaveBeenCalledWith(
      message,
      "https://iframe.example.com",
    );

    void sdk.destroy();
  });

  it("sendIframeBridgeMessage is a safe no-op when there is no active iframe", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });

    expect(
      sdk.sendIframeBridgeMessage({
        type: "insightfull.recording_event",
        version: 1,
        recordingSessionId: "session-1",
        format: "dom-event-stream",
        formatVersion: "1",
        event: { type: "click" },
      }),
    ).toBe(false);

    void sdk.destroy();
  });

  it("returns recorder-safe context with primitive custom attributes only", () => {
    const sdk = InsightfullSDK.init({ clientId: "env_test", autoTrack: false });
    window.history.replaceState({}, "", "/checkout?step=shipping");
    sdk.identify("user-123", { plan: "pro", nested: { unsafe: true } });
    sdk.setCustomId("account", "acct-123");
    sdk.setAttribute("seats", 5);
    sdk.setAttribute("beta", true);
    sdk.setAttribute("empty", null);
    sdk.setAttribute("list", ["unsafe"]);

    expect(sdk.getRecorderContext()).toEqual({
      activeStudyId: null,
      customAttributes: {
        beta: true,
        empty: null,
        plan: "pro",
        seats: 5,
      },
      customId: { account: "acct-123" },
      path: "/checkout",
      sdkEnvironmentId: "env_test",
      url: "http://localhost:3000/checkout?step=shipping",
      userId: "user-123",
      visitorId: sdk.currentVisitorId,
    });

    void sdk.destroy();
  });

  it("does not create the default iframe when a custom renderer is provided", async () => {
    mockedFetchConfig.mockResolvedValueOnce(makeConfig([makeStudy()]));
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });

    await waitForSdkConfig();

    sdk.track("checkout_completed");

    expect(renderStudy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("insightfull-study-1")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();

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

  it("replays pre-config trigger evaluations through a custom renderer", async () => {
    let resolveConfig: (config: SdkConfig) => void;
    mockedFetchConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }),
    );
    const renderStudy = vi.fn<InsightfullStudyRenderer>();
    const sdk = InsightfullSDK.init({
      clientId: "env_test",
      autoTrack: false,
      renderStudy,
    });

    sdk.track("checkout_completed");
    expect(renderStudy).not.toHaveBeenCalled();

    resolveConfig!(makeConfig([makeStudy()]));
    await waitForSdkConfig();

    expect(renderStudy).toHaveBeenCalledTimes(1);
    expect(renderStudy.mock.calls[0]?.[0].context.triggerEvent).toBe("checkout_completed");

    void sdk.destroy();
  });
});
