import { beforeEach, describe, expect, it } from "vitest";
import {
  buildContextPayload,
  buildStudyIframeUrl,
  buildStudyRenderPayload,
  removeStudy,
  renderStudy,
  setStudyDisplayState,
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

  it("applies supported appearance controls to the default renderer", () => {
    const host = renderStudy("https://insightfull.ai", makeStudy(), makeContext(), {
      appearance: {
        accentColor: "#0f766e",
        borderRadius: 20,
        height: 700,
        minimizedLabel: "Share feedback",
        offset: 24,
        placement: "bottom-left",
        textColor: "#f8fafc",
        width: 480,
        zIndex: 123_456,
      },
    });

    expect(host.style.bottom).toBe("24px");
    expect(host.style.left).toBe("24px");
    expect(host.style.width).toBe("480px");
    expect(host.style.height).toBe("700px");
    expect(host.style.borderRadius).toBe("20px");
    expect(host.style.zIndex).toBe("123456");
    const pill = host.querySelector<HTMLButtonElement>('[data-role="insightfull-minimized-pill"]');
    expect(pill?.textContent).toContain("Share feedback");
    expect(pill?.style.background).toBe("rgb(15, 118, 110)");
    expect(pill?.style.color).toBe("rgb(248, 250, 252)");
  });

  it("restores centered placement and configured size after minimizing", () => {
    const host = renderStudy("https://insightfull.ai", makeStudy({ id: 11 }), makeContext(), {
      appearance: {
        height: 720,
        minimizedPlacement: "bottom-left",
        offset: 16,
        placement: "center",
        width: 560,
      },
    });

    expect(host.style.left).toBe("50%");
    expect(host.style.top).toBe("50%");
    expect(host.style.transform).toBe("translate(-50%, -50%)");

    setStudyDisplayState(11, "minimized");
    expect(host.style.bottom).toBe("16px");
    expect(host.style.left).toBe("16px");
    expect(host.style.transform).toBe("none");

    setStudyDisplayState(11, "expanded");
    expect(host.style.width).toBe("560px");
    expect(host.style.height).toBe("720px");
    expect(host.style.left).toBe("50%");
    expect(host.style.top).toBe("50%");
    expect(host.style.transform).toBe("translate(-50%, -50%)");
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

  it("builds one iframe URL source of truth for default and custom renderers", () => {
    const study = makeStudy({ shareUrl: null, id: 123 });
    const context = makeContext({
      customAttributes: { plan: "pro" },
      customId: { account: "acct-123" },
      triggerEvent: "purchase",
      userId: "user-123",
    });

    const iframeUrl = buildStudyIframeUrl("https://insightfull.ai", study, context);
    const renderPayload = buildStudyRenderPayload("https://insightfull.ai", study, context);

    expect(renderPayload.iframeUrl).toBe(iframeUrl);
    expect(renderPayload.study).toBe(study);
    expect(renderPayload.context).toEqual(context);
    expect(renderPayload.dismiss).toEqual(expect.any(Function));
    expect(renderPayload.expand).toEqual(expect.any(Function));
    expect(renderPayload.minimize).toEqual(expect.any(Function));
    expect(renderPayload.onDisplayStateChange).toEqual(expect.any(Function));

    const url = new URL(iframeUrl);
    const encodedContext = url.searchParams.get("ctx");
    expect(url.pathname).toBe("/study/id/123");
    expect(encodedContext).not.toBeNull();
    expect(JSON.parse(atob(encodedContext ?? ""))).toEqual(context);
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

  it("keeps a single-use launch token in the iframe fragment instead of encoded context", () => {
    const context = makeContext({ agentLaunchToken: "signed-token", source: "in_app" });
    const iframeUrl = new URL(buildStudyIframeUrl("https://insightfull.ai", makeStudy(), context));

    expect(iframeUrl.hash).toBe("#instfl_agent=signed-token");
    const encodedContext = iframeUrl.searchParams.get("ctx");
    expect(JSON.parse(atob(encodedContext ?? ""))).not.toHaveProperty("agentLaunchToken");
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

  // ── Display state (collapse/minimize) ─────────────────────────────

  it("creates a minimized pill element hidden by default", () => {
    const study = makeStudy();
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    const host = document.getElementById("insightfull-study-1");
    expect(host?.dataset.displayState).toBe("expanded");

    const pill = host?.querySelector('[data-role="insightfull-minimized-pill"]');
    expect(pill).not.toBeNull();
    expect((pill as HTMLElement)?.style.display).toBe("none");
  });

  it("setStudyDisplayState minimized hides iframe wrapper and shows pill", () => {
    const study = makeStudy({ id: 5 });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    setStudyDisplayState(5, "minimized");

    const host = document.getElementById("insightfull-study-5");
    expect(host?.dataset.displayState).toBe("minimized");

    const wrapper = host?.querySelector('[data-role="insightfull-iframe-wrapper"]');
    expect((wrapper as HTMLElement)?.style.display).toBe("none");

    const pill = host?.querySelector('[data-role="insightfull-minimized-pill"]');
    expect((pill as HTMLElement)?.style.display).toBe("flex");
  });

  it("setStudyDisplayState expanded restores full size and hides pill", () => {
    const study = makeStudy({ id: 6 });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    setStudyDisplayState(6, "minimized");
    setStudyDisplayState(6, "expanded");

    const host = document.getElementById("insightfull-study-6");
    expect(host?.dataset.displayState).toBe("expanded");
    expect(host?.style.width).toBe("420px");
    expect(host?.style.height).toBe("640px");

    const wrapper = host?.querySelector('[data-role="insightfull-iframe-wrapper"]');
    expect((wrapper as HTMLElement)?.style.display).toBe("block");

    const pill = host?.querySelector('[data-role="insightfull-minimized-pill"]');
    expect((pill as HTMLElement)?.style.display).toBe("none");
  });

  it("keeps the iframe in the DOM when minimized so contentWindow stays alive", () => {
    const study = makeStudy({ id: 7 });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    setStudyDisplayState(7, "minimized");

    const iframe = document.querySelector("#insightfull-study-7 iframe");
    expect(iframe).not.toBeNull();
  });

  it("pill click expands the study", () => {
    const study = makeStudy({ id: 8 });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    setStudyDisplayState(8, "minimized");

    const pill = document.querySelector(
      '#insightfull-study-8 [data-role="insightfull-minimized-pill"]',
    ) as HTMLButtonElement;
    expect(pill).not.toBeNull();

    pill.click();

    const host = document.getElementById("insightfull-study-8");
    expect(host?.dataset.displayState).toBe("expanded");
  });

  it("setStudyDisplayState is a safe no-op if study container does not exist", () => {
    expect(() => setStudyDisplayState(999, "minimized")).not.toThrow();
  });

  it("pill has accessible aria-label with study title", () => {
    const study = makeStudy({ id: 9, title: "Checkout Usability" });
    const context = makeContext();
    renderStudy("https://insightfull.ai", study, context);

    const pill = document.querySelector(
      '#insightfull-study-9 [data-role="insightfull-minimized-pill"]',
    ) as HTMLButtonElement;
    expect(pill?.getAttribute("aria-label")).toBe("Expand Checkout Usability");
  });
});
