// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBridgeMessageEnvelope,
  createWebResearchClient,
  type AnyBridgeMessage,
} from "@insightfull/web-research-sdk";

import {
  createReactWebResearchClient,
  getOverlayBridgeStatus,
  OverlayBridgeFrame,
  useOverlayBridgeStatus,
  useWebResearchClient,
  WebResearchProvider,
} from "./index";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function render(element: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    rerender: (nextElement: ReturnType<typeof createElement>) => {
      act(() => {
        root.render(nextElement);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createClient(overrides?: Partial<Parameters<typeof createWebResearchClient>[0]>) {
  return createWebResearchClient({
    apiKey: "test-api-key",
    environment: "dev",
    sessionId: "session-1",
    bridge: {
      iframeOrigin: "https://overlay.example.com",
      parentOrigin: "https://host.example.com",
      helloTimeoutMs: 25,
      readyTimeoutMs: 25,
      handshake: {
        overlayToken: "overlay-token",
        overlayTokenExpiresAt: "2026-03-31T00:00:00.000Z",
        authorizedCapabilities: ["task_prompts", "agent_audio"],
        context: {
          organizationId: 1,
          studyId: 2,
          sectionId: 3,
          sessionId: "session-1",
          tabId: "tab-1",
        },
        uiConfig: {
          defaultPosition: "bottom-right",
          showAiPersona: false,
          theme: "system",
        },
        consent: {
          mode: "best_effort",
          captureAllowed: true,
        },
      },
    },
    ...overrides,
  });
}

function StatusProbe(props: { onValue: (value: string) => void }) {
  const client = useWebResearchClient();
  const status = useOverlayBridgeStatus(client);

  useEffect(() => {
    props.onValue(status.lifecycleState);
  }, [props, status.lifecycleState]);

  return createElement("div", {
    "data-state": status.lifecycleState,
    "data-ready": String(status.isReady),
    "data-degraded": String(status.isDegraded),
  });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("package import behavior", () => {
  it("has no import-time browser side effects", async () => {
    vi.resetModules();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener,
        removeEventListener,
      },
    });

    await import("./index");

    expect(addEventListener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });
});

describe("WebResearchProvider and hooks", () => {
  it("provides the client instance and derived bridge status", () => {
    const lifecycleStates: string[] = [];
    const client = createClient();

    const view = render(
      createElement(
        WebResearchProvider,
        { client },
        createElement(StatusProbe, {
          onValue: (value) => lifecycleStates.push(value),
        }),
      ),
    );

    expect(lifecycleStates[lifecycleStates.length - 1]).toBe("UNMOUNTED");
    expect(getOverlayBridgeStatus(client.bridge.getSnapshot())).toMatchObject({
      lifecycleState: "UNMOUNTED",
      isDegraded: false,
    });

    view.unmount();
  });

  it("can create a client from options", () => {
    const client = createReactWebResearchClient({ apiKey: "test-api-key", environment: "staging" });
    const session = client.getSession() as { sessionId: string; environment?: string };

    expect(session.sessionId).toHaveLength(36);
    if (session.environment !== undefined) {
      expect(session.environment).toBe("staging");
    }
  });

  it("supports explicit-client hooks outside WebResearchProvider", () => {
    const observedStates: string[] = [];
    const client = createClient();

    const ExplicitClientProbe = () => {
      const status = useOverlayBridgeStatus(client);

      useEffect(() => {
        observedStates.push(status.lifecycleState);
      }, [status.lifecycleState]);

      return null;
    };

    const view = render(createElement(ExplicitClientProbe));

    expect(observedStates).toEqual(["UNMOUNTED"]);

    view.unmount();
  });

  it("throws a helpful error when overlay hooks have no client source", () => {
    const MissingClientProbe = () => {
      useOverlayBridgeStatus();
      return null;
    };

    expect(() => render(createElement(MissingClientProbe))).toThrowError(
      "useOverlayBridgeStatus requires a client argument or WebResearchProvider",
    );
  });
});

describe("OverlayBridgeFrame", () => {
  it("runs the iframe hello/init/ready handshake with mocked postMessage transport", () => {
    const client = createClient();
    const view = render(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
          title: "Overlay",
        }),
      ),
    );

    const iframe = view.container.querySelector("iframe");
    expect(iframe).not.toBeNull();

    const postMessage = vi.fn();
    Object.defineProperty(iframe!, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      iframe!.dispatchEvent(new Event("load"));
    });

    const helloMessage = createBridgeMessageEnvelope({
      type: "overlay:hello",
      payload: {
        overlayInstanceId: "overlay-1",
        supportedVersions: ["1.0"],
        capabilities: ["task_prompts", "agent_video"],
        overlayBuild: "build-1",
      },
      sessionId: "session-1",
      bridgeInstanceId: client.bridge.getSnapshot().bridgeInstanceId,
      sequence: 1,
      messageId: "msg-hello",
      sentAtMs: 1,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: helloMessage,
          origin: "https://overlay.example.com",
          source: iframe!.contentWindow,
        }),
      );
    });

    const outboundTypes = postMessage.mock.calls.map((call) => (call[0] as AnyBridgeMessage).type);
    expect(outboundTypes).toEqual(["bridge:ack", "overlay:init"]);
    expect(postMessage.mock.calls[0]?.[1]).toBe("https://overlay.example.com");

    const initMessage = postMessage.mock.calls[1]?.[0] as Extract<
      AnyBridgeMessage,
      { type: "overlay:init" }
    >;
    expect(initMessage.payload.selectedCapabilities).toEqual(["task_prompts"]);

    const readyMessage = createBridgeMessageEnvelope({
      type: "overlay:ready",
      payload: {
        overlayInstanceId: "overlay-1",
        acceptedCapabilities: ["task_prompts"],
        media: {
          audioReady: true,
          videoReady: false,
        },
      },
      sessionId: "session-1",
      bridgeInstanceId: client.bridge.getSnapshot().bridgeInstanceId,
      overlayInstanceId: "overlay-1",
      correlationId: initMessage.messageId,
      sequence: 2,
      messageId: "msg-ready",
      sentAtMs: 2,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyMessage,
          origin: "https://overlay.example.com",
          source: iframe!.contentWindow,
        }),
      );
    });

    expect(client.bridge.getState()).toBe("READY");
    expect(client.bridge.getSnapshot()).toMatchObject({
      overlayInstanceId: "overlay-1",
      selectedVersion: "1.0",
      negotiatedCapabilities: ["task_prompts"],
    });
    expect(postMessage.mock.calls[2]?.[0]).toMatchObject({ type: "bridge:ack" });

    view.unmount();
  });

  it("surfaces degraded state when hello never arrives", () => {
    vi.useFakeTimers();
    const observedStates: string[] = [];
    const client = createClient();

    const view = render(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
        }),
        createElement(StatusProbe, {
          onValue: (value) => observedStates.push(value),
        }),
      ),
    );

    const iframe = view.container.querySelector("iframe");
    expect(iframe).not.toBeNull();

    act(() => {
      iframe!.dispatchEvent(new Event("load"));
    });

    expect(getOverlayBridgeStatus(client.bridge.getSnapshot())).toMatchObject({
      lifecycleState: "HANDSHAKE_PENDING",
      isHandshakePending: true,
    });

    act(() => {
      vi.advanceTimersByTime(25);
    });

    expect(observedStates[observedStates.length - 1]).toBe("DEGRADED");
    expect(getOverlayBridgeStatus(client.bridge.getSnapshot())).toMatchObject({
      lifecycleState: "DEGRADED",
      isDegraded: true,
    });

    view.unmount();
  });

  it("sends one customization update with latest value after ready", () => {
    const client = createClient();
    const bridgeWithCustomization = client.bridge as typeof client.bridge & {
      updateCustomization?: (
        customization: unknown,
        options?: { dispatch?: (message: AnyBridgeMessage) => void },
      ) => void;
    };

    if (!bridgeWithCustomization.updateCustomization) {
      bridgeWithCustomization.updateCustomization = (customization, options) => {
        const message = {
          type: "overlay:customization_update",
          payload: { customization },
        } as AnyBridgeMessage;

        options?.dispatch?.(message);
        return message as never;
      };
    }

    const initialCustomization = {
      persona: "obsidian",
      tailwindTheme: {
        primary: "#1f2937",
      },
    } as const;

    const updatedCustomization = {
      persona: "glint",
      tailwindTheme: {
        primary: "#22c55e",
      },
    } as const;

    const view = render(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
          title: "Overlay",
          customization: initialCustomization,
        }),
      ),
    );

    const iframe = view.container.querySelector("iframe");
    expect(iframe).not.toBeNull();

    const postMessage = vi.fn();
    Object.defineProperty(iframe!, "contentWindow", {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      iframe!.dispatchEvent(new Event("load"));
    });

    view.rerender(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
          title: "Overlay",
          customization: updatedCustomization,
        }),
      ),
    );

    const helloMessage = createBridgeMessageEnvelope({
      type: "overlay:hello",
      payload: {
        overlayInstanceId: "overlay-1",
        supportedVersions: ["1.0"],
        capabilities: ["task_prompts", "agent_video"],
        overlayBuild: "build-1",
      },
      sessionId: "session-1",
      bridgeInstanceId: client.bridge.getSnapshot().bridgeInstanceId,
      sequence: 1,
      messageId: "msg-hello",
      sentAtMs: 1,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: helloMessage,
          origin: "https://overlay.example.com",
          source: iframe!.contentWindow,
        }),
      );
    });

    const initMessage = postMessage.mock.calls[1]?.[0] as Extract<
      AnyBridgeMessage,
      { type: "overlay:init" }
    >;

    const readyMessage = createBridgeMessageEnvelope({
      type: "overlay:ready",
      payload: {
        overlayInstanceId: "overlay-1",
        acceptedCapabilities: ["task_prompts"],
        media: {
          audioReady: true,
          videoReady: false,
        },
      },
      sessionId: "session-1",
      bridgeInstanceId: client.bridge.getSnapshot().bridgeInstanceId,
      overlayInstanceId: "overlay-1",
      correlationId: initMessage.messageId,
      sequence: 2,
      messageId: "msg-ready",
      sentAtMs: 2,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: readyMessage,
          origin: "https://overlay.example.com",
          source: iframe!.contentWindow,
        }),
      );
    });

    const customizationMessages = postMessage.mock.calls
      .map((call) => call[0] as { type?: string; payload?: Record<string, unknown> })
      .filter((message) => message.type === "overlay:customization_update");

    expect(customizationMessages).toHaveLength(1);
    expect(customizationMessages[0]?.payload).toMatchObject({
      customization: updatedCustomization,
    });

    view.rerender(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
          title: "Overlay",
        }),
      ),
    );

    view.rerender(
      createElement(
        WebResearchProvider,
        { client },
        createElement(OverlayBridgeFrame, {
          src: "https://overlay.example.com/embed",
          title: "Overlay",
          customization: updatedCustomization,
        }),
      ),
    );

    const customizationMessagesAfterReset = postMessage.mock.calls
      .map((call) => call[0] as { type?: string; payload?: Record<string, unknown> })
      .filter((message) => message.type === "overlay:customization_update");

    expect(customizationMessagesAfterReset).toHaveLength(2);
    expect(customizationMessagesAfterReset[1]?.payload).toMatchObject({
      customization: updatedCustomization,
    });

    view.unmount();
  });
});
