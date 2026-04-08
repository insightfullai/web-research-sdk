import {
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  type AnyBridgeMessage,
  type BridgeMessage,
} from "./protocol";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createBridgeMessageEnvelope,
  createPostMessageTransport,
  createWebResearchClient,
  OverlayBridgeRuntime,
  validateBridgeOrigin,
  validateSupportedBridgeVersion,
  type OverlayBridgeController,
  type WebResearchClient,
} from "./index";

function createTestRuntime() {
  let idCounter = 0;

  return new OverlayBridgeRuntime({
    sessionId: "session-1",
    bridgeInstanceId: "bridge-1",
    bridge: {
      iframeOrigin: "https://overlay.example.com",
      parentOrigin: "https://host.example.com",
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
          showAiPersona: true,
          theme: "system",
        },
        consent: {
          mode: "required",
          captureAllowed: true,
        },
      },
    },
    dependencies: {
      now: () => Date.now(),
      generateId: () => `msg-${++idCounter}`,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
}

function createIncomingMessage<TType extends AnyBridgeMessage["type"]>(
  message: Extract<AnyBridgeMessage, { type: TType }>,
) {
  return message;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createWebResearchClient", () => {
  it("creates a stable client facade", () => {
    const client = createWebResearchClient({
      environment: "dev",
      bridge: {
        iframeOrigin: "https://overlay.example.com",
      },
    });

    expect(client.getSession().sessionId).toHaveLength(36);
    expect(client.getSession().environment).toBe("dev");
    expect(client.getLifecycleState()).toBe("UNMOUNTED");
    expect(typeof client.bridge.mount).toBe("function");
    expect(typeof client.destroy).toBe("function");
  });

  it("requires a valid environment", () => {
    expect(() =>
      createWebResearchClient({
        environment: "local" as "dev",
      }),
    ).toThrowError('environment must be one of "dev", "staging", or "prod"');
    expect(() =>
      createWebResearchClient({} as Parameters<typeof createWebResearchClient>[0]),
    ).toThrowError('environment must be one of "dev", "staging", or "prod"');
  });

  it("rejects undefined or non-object options with a clear error", () => {
    expect(() =>
      createWebResearchClient(
        undefined as unknown as Parameters<typeof createWebResearchClient>[0],
      ),
    ).toThrowError("createWebResearchClient options must be an object");
    expect(() =>
      createWebResearchClient(
        "invalid" as unknown as Parameters<typeof createWebResearchClient>[0],
      ),
    ).toThrowError("createWebResearchClient options must be an object");
  });
});

describe("protocol helpers", () => {
  it("stamps requiresAck from shared message specs", () => {
    const initMessage = createBridgeMessageEnvelope({
      type: "overlay:init",
      payload: {
        selectedVersion: BRIDGE_VERSION,
        parentOrigin: "https://host.example.com",
        overlayToken: "overlay-token",
        overlayTokenExpiresAt: "2026-03-31T00:00:00.000Z",
        selectedCapabilities: ["task_prompts"],
        context: {
          organizationId: 1,
          studyId: 2,
          sectionId: 3,
          sessionId: "session-1",
          tabId: "tab-1",
        },
        uiConfig: {
          defaultPosition: "bottom-right",
          showAiPersona: true,
        },
        consent: {
          mode: "required",
          captureAllowed: true,
        },
      },
      sessionId: "session-1",
      bridgeInstanceId: "bridge-1",
      sequence: 1,
      messageId: "msg-init",
      sentAtMs: 1,
    });
    const navigationMessage = createBridgeMessageEnvelope({
      type: "overlay:navigation_context",
      payload: {
        pageUrl: "https://example.com/products?q=redacted",
        pagePath: "/products",
        routeType: "history",
        timestampMs: 1,
      },
      sessionId: "session-1",
      bridgeInstanceId: "bridge-1",
      sequence: 2,
      messageId: "msg-nav",
      sentAtMs: 2,
    });

    expect(initMessage.requiresAck).toBe(true);
    expect(navigationMessage.requiresAck).toBe(false);
    expect(initMessage.namespace).toBe(BRIDGE_NAMESPACE);
  });

  it("validates supported versions and origin checks", () => {
    expect(validateSupportedBridgeVersion("1.0")).toMatchObject({ isSupported: true });
    expect(validateSupportedBridgeVersion("2.0")).toMatchObject({ isSupported: false });

    expect(
      validateBridgeOrigin({
        expectedOrigin: "https://overlay.example.com/path",
        actualOrigin: "https://overlay.example.com",
      }),
    ).toMatchObject({ success: true, normalizedOrigin: "https://overlay.example.com" });

    expect(
      validateBridgeOrigin({
        expectedOrigin: "https://overlay.example.com",
        actualOrigin: "https://attacker.example.com",
      }),
    ).toMatchObject({ success: false, code: "BRG_ORIGIN_MISMATCH" });

    expect(
      validateBridgeOrigin({
        expectedOrigin: "http://overlay.example.com",
        actualOrigin: "http://overlay.example.com",
      }),
    ).toMatchObject({ success: false, code: "BRG_ORIGIN_MISMATCH" });
  });
});

describe("OverlayBridgeRuntime", () => {
  it("progresses handshake to READY and tracks negotiated state", () => {
    const runtime = createTestRuntime();
    const dispatched: AnyBridgeMessage[] = [];

    runtime.mount();
    runtime.markIframeLoaded();

    const helloMessage = createIncomingMessage(
      createBridgeMessageEnvelope({
        type: "overlay:hello",
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["task_prompts", "token_refresh", "agent_video"],
          overlayBuild: "build-1",
        },
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        sequence: 1,
        messageId: "msg-hello",
        sentAtMs: 1,
      }),
    );

    const helloResult = runtime.receiveMessage(helloMessage, {
      origin: "https://overlay.example.com",
      dispatch: (message) => dispatched.push(message),
    });
    const initMessage = runtime.beginHandshake(helloMessage, {
      dispatch: (message) => dispatched.push(message),
    });

    const readyMessage = createIncomingMessage(
      createBridgeMessageEnvelope({
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
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        correlationId: initMessage.messageId,
        sequence: 2,
        messageId: "msg-ready",
        sentAtMs: 2,
      }),
    );

    const readyResult = runtime.receiveMessage(readyMessage, {
      origin: "https://overlay.example.com",
      dispatch: (message) => dispatched.push(message),
    });

    expect(helloResult.accepted).toBe(true);
    expect(initMessage.type).toBe("overlay:init");
    expect(initMessage.payload.selectedCapabilities).toEqual(["task_prompts"]);
    expect(readyResult.accepted).toBe(true);
    expect(runtime.getState()).toBe("READY");
    expect(runtime.getSnapshot()).toMatchObject({
      overlayInstanceId: "overlay-1",
      selectedVersion: "1.0",
      negotiatedCapabilities: ["task_prompts"],
    });
    expect(dispatched.map((message) => message.type)).toEqual([
      "bridge:ack",
      "overlay:init",
      "bridge:ack",
    ]);
  });

  it("enters DEGRADED when overlay:hello times out", () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();

    runtime.mount();
    runtime.markIframeLoaded();
    vi.advanceTimersByTime(5_000);

    expect(runtime.getState()).toBe("DEGRADED");
    expect(runtime.getSnapshot().diagnostics.at(-1)).toMatchObject({
      code: "BRG_IFRAME_UNAVAILABLE",
    });
  });

  it("retries overlay:init on ready timeout and then degrades", () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    const dispatched: AnyBridgeMessage[] = [];

    runtime.mount();
    runtime.markIframeLoaded();

    const helloMessage = createIncomingMessage(
      createBridgeMessageEnvelope({
        type: "overlay:hello",
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["task_prompts"],
          overlayBuild: "build-1",
        },
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        sequence: 1,
        messageId: "msg-hello",
        sentAtMs: 1,
      }),
    );

    runtime.receiveMessage(helloMessage, {
      origin: "https://overlay.example.com",
      dispatch: (message) => dispatched.push(message),
    });
    runtime.beginHandshake(helloMessage, {
      dispatch: (message) => dispatched.push(message),
    });

    vi.advanceTimersByTime(5_000);
    vi.advanceTimersByTime(5_000);
    expect(dispatched.filter((message) => message.type === "overlay:init")).toHaveLength(3);

    vi.advanceTimersByTime(5_000);

    expect(runtime.getState()).toBe("DEGRADED");
    expect(runtime.getSnapshot().diagnostics.at(-1)).toMatchObject({
      code: "BRG_ACK_TIMEOUT",
    });
  });

  it("dedupes messages by messageId and records non-monotonic sequence diagnostics", () => {
    const runtime = createTestRuntime();
    const dispatched: AnyBridgeMessage[] = [];

    runtime.mount();
    runtime.markIframeLoaded();

    const helloMessage = createIncomingMessage(
      createBridgeMessageEnvelope({
        type: "overlay:hello",
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["task_prompts"],
          overlayBuild: "build-1",
        },
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        sequence: 10,
        messageId: "msg-hello",
        sentAtMs: 1,
      }),
    );

    const first = runtime.receiveMessage(helloMessage, {
      origin: "https://overlay.example.com",
      dispatch: (message) => dispatched.push(message),
    });
    const duplicate = runtime.receiveMessage(helloMessage, {
      origin: "https://overlay.example.com",
      dispatch: (message) => dispatched.push(message),
    });

    const diagnosticMessage = createIncomingMessage(
      createBridgeMessageEnvelope({
        type: "overlay:diagnostic",
        payload: {
          level: "warn",
          code: "overlay_warn",
          message: "late packet",
        },
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        sequence: 9,
        messageId: "msg-diagnostic",
        sentAtMs: 2,
      }),
    );

    const diagnosticResult = runtime.receiveMessage(diagnosticMessage, {
      origin: "https://overlay.example.com",
    });

    expect(first.accepted).toBe(true);
    expect(duplicate).toMatchObject({ accepted: true, duplicate: true });
    expect(diagnosticResult.accepted).toBe(true);
    expect(runtime.getSnapshot().diagnostics.map((entry) => entry.code)).toContain(
      "BRG_SEQUENCE_OUT_OF_ORDER",
    );
  });

  it("terminates on origin mismatch", () => {
    const runtime = createTestRuntime();

    runtime.mount();
    runtime.markIframeLoaded();

    const result = runtime.receiveMessage(
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:hello",
        messageId: "msg-hello",
        sequence: 1,
        sentAtMs: 1,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["task_prompts"],
          overlayBuild: "build-1",
        },
      },
      { origin: "https://attacker.example.com" },
    );

    expect(result.accepted).toBe(false);
    expect(runtime.getState()).toBe("TERMINATED");
  });

  it("terminates when a message targets the wrong bridge session or instance", () => {
    const runtime = createTestRuntime();

    runtime.mount();
    runtime.markIframeLoaded();

    const result = runtime.receiveMessage(
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:hello",
        messageId: "msg-hello",
        sequence: 1,
        sentAtMs: 1,
        sessionId: "session-2",
        bridgeInstanceId: "bridge-2",
        requiresAck: true,
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["task_prompts"],
          overlayBuild: "build-1",
        },
      },
      { origin: "https://overlay.example.com" },
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: "message sessionId does not match the active bridge session",
    });
    expect(runtime.getState()).toBe("TERMINATED");
    expect(runtime.getSnapshot().diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["BRG_SCHEMA_INVALID", "BRG_IFRAME_UNAVAILABLE"]),
    );
  });

  it("retries ack-required messages and clears pending ack state on timeout exhaustion", () => {
    vi.useFakeTimers();
    const runtime = createTestRuntime();
    const dispatched: AnyBridgeMessage[] = [];

    runtime.sendMessage(
      "overlay:task_update",
      {
        activeTaskId: "task-1",
        tasks: [{ id: "task-1", status: "active", instruction: "Do the thing" }],
      },
      {
        dispatch: (message) => dispatched.push(message),
      },
    );

    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(800);
    vi.advanceTimersByTime(1_500);

    expect(dispatched.filter((message) => message.type === "overlay:task_update")).toHaveLength(3);
    expect(runtime.getSnapshot().pendingAckMessageIds).toHaveLength(0);
    expect(runtime.getSnapshot().diagnostics.at(-1)).toMatchObject({ code: "BRG_ACK_TIMEOUT" });
  });

  it("sends overlay:customization_update through updateCustomization helper", () => {
    const runtime = createTestRuntime();
    const dispatched: AnyBridgeMessage[] = [];

    const message = runtime.updateCustomization(
      {
        persona: "command",
        tailwindTheme: {
          primary: "#111827",
          primaryForeground: null,
        },
      },
      {
        dispatch: (outgoing) => dispatched.push(outgoing),
      },
    );

    expect(message.type).toBe("overlay:customization_update");
    expect(message.requiresAck).toBe(true);
    expect(message.payload.customization).toEqual({
      persona: "command",
      tailwindTheme: {
        primary: "#111827",
        primaryForeground: null,
      },
    });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: "overlay:customization_update",
      payload: {
        customization: {
          persona: "command",
        },
      },
    });
    expect(runtime.getSnapshot().pendingAckMessageIds).toContain(message.messageId);
  });
});

describe("type compatibility", () => {
  it("preserves the intended public types", () => {
    const client = createWebResearchClient({ environment: "dev" });

    expectTypeOf<WebResearchClient>().toMatchTypeOf(client);
    expectTypeOf<OverlayBridgeController>().toMatchTypeOf(client.bridge);
    expectTypeOf(client.bridge.beginHandshake).returns.toEqualTypeOf<
      BridgeMessage<"overlay:init">
    >();
  });
});

describe("transport helpers", () => {
  it("includes session environment in postMessage batch and completion payloads", async () => {
    const postMessage = vi.fn();
    const transport = createPostMessageTransport({
      targetWindow: { postMessage },
      targetOrigin: "https://collector.example.com",
    });

    await transport.send({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
        environment: "staging",
      },
      events: [],
      reason: "manual",
    });
    await transport.complete?.({
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-01T00:00:00.000Z",
        environment: "staging",
      },
      reason: "complete",
      sentAt: "2026-04-01T00:00:01.000Z",
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      batch: {
        session: {
          environment: "staging",
        },
      },
    });
    expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
      payload: {
        session: {
          environment: "staging",
        },
      },
    });
  });
});
