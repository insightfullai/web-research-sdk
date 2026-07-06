import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContextPayload,
  removeStudy,
  renderStudy,
} from "../iframe-renderer/iframe-renderer.js";
import type { SdkContext, StudyContent } from "../types/index.js";

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
    triggers: [],
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

describe("iframe renderer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("creates a positioned div with correct styles", () => {
    const study = makeStudy();
    const context = makeContext();
    const host = renderStudy("https://insightfull.ai", study, context);

    expect(host.id).toBe("insightfull-study-1");
    expect(host.style.position).toBe("fixed");
    expect(host.style.bottom).toBe("20px");
    expect(host.style.right).toBe("20px");
    expect(host.style.width).toBe("420px");
    expect(host.style.height).toBe("640px");
    expect(document.body.contains(host)).toBe(true);
  });

  it("creates an iframe with correct src including context", () => {
    const study = makeStudy({ shareUrl: "my-study" });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    const host = document.getElementById("insightfull-study-1");
    expect(host).not.toBeNull();

    const iframe = host?.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("https://insightfull.ai/study/my-study?ctx=");
  });

  it("iframe has correct allow attributes", () => {
    const study = makeStudy();
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("allow")).toBe("clipboard-write");
  });

  it("iframe has title attribute from study", () => {
    const study = makeStudy({ title: "User Interview" });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("title")).toBe("User Interview");
  });

  it("context payload is valid base64-decoded JSON", () => {
    const context = makeContext({
      visitorId: "v-1",
      userId: "u-1",
      triggerEvent: "purchase",
    });
    const payload = buildContextPayload(context);

    // Should be valid base64
    const decoded = JSON.parse(atob(payload));
    expect(decoded.visitorId).toBe("v-1");
    expect(decoded.userId).toBe("u-1");
    expect(decoded.triggerEvent).toBe("purchase");
    expect(decoded.source).toBe("web_sdk");
  });

  it("removeStudy cleans up DOM", () => {
    const study = makeStudy({ id: 99 });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    expect(document.getElementById("insightfull-study-99")).not.toBeNull();

    removeStudy(99);

    expect(document.getElementById("insightfull-study-99")).toBeNull();
  });

  it("removeStudy is a no-op if element doesn't exist", () => {
    expect(() => removeStudy(999)).not.toThrow();
  });

  it("replaces existing study on re-render", () => {
    const study = makeStudy({ id: 1 });
    const context1 = makeContext({ triggerEvent: "event1" });
    const context2 = makeContext({ triggerEvent: "event2" });

    renderStudy("https://insightfull.ai", study, context1);
    const host1 = document.getElementById("insightfull-study-1");

    renderStudy("https://insightfull.ai", study, context2);
    const host2 = document.getElementById("insightfull-study-1");

    // Should be a different element (old one removed, new one created)
    expect(host1).not.toBe(host2);
    expect(document.querySelectorAll("#insightfull-study-1").length).toBe(1);
  });
});
