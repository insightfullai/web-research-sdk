import { describe, expect, it } from "vitest";

import {
  assertBridgeMessage,
  BRIDGE_CAPABILITIES,
  BRIDGE_ERROR_CODES,
  BRIDGE_MESSAGE_SPECS,
  BRIDGE_MESSAGE_TYPES,
  BRIDGE_NAMESPACE,
  BRIDGE_RETRY_POLICY,
  BRIDGE_VERSION,
  OVERLAY_LIFECYCLE_STATES,
  SDK_LIFECYCLE_STATES,
  type SdkEvent,
  validateBridgeMessage,
  validateBridgeMessageType,
} from "./index";

describe("shared legacy types", () => {
  it("shape can represent sdk events", () => {
    const event: SdkEvent = {
      name: "session.started",
      payload: { source: "unit-test" },
    };

    expect(event.name).toBe("session.started");
  });
});

describe("protocol constants", () => {
  it("matches the protocol namespace, version, capabilities, and lifecycle states", () => {
    expect(BRIDGE_NAMESPACE).toBe("insightfull.overlay-bridge");
    expect(BRIDGE_VERSION).toBe("1.0");
    expect(BRIDGE_CAPABILITIES).toEqual([
      "agent_audio",
      "agent_video",
      "pointer_passthrough",
      "task_prompts",
      "dynamic_overlay_resize",
      "token_refresh",
    ]);
    expect(SDK_LIFECYCLE_STATES).toEqual([
      "UNMOUNTED",
      "IFRAME_LOADING",
      "HANDSHAKE_PENDING",
      "READY",
      "DEGRADED",
      "TERMINATED",
    ]);
    expect(OVERLAY_LIFECYCLE_STATES).toEqual([
      "BOOTING",
      "HELLO_SENT",
      "INIT_RECEIVED",
      "READY",
      "RECOVERING",
      "CLOSED",
    ]);
  });

  it("matches the protocol message catalog and retry policy", () => {
    expect(BRIDGE_MESSAGE_TYPES).toEqual([
      "overlay:init",
      "overlay:task_update",
      "overlay:navigation_context",
      "overlay:session_state",
      "overlay:token_refresh",
      "overlay:shutdown",
      "overlay:hello",
      "overlay:ready",
      "overlay:ui_command",
      "overlay:session_action",
      "overlay:token_refresh_request",
      "overlay:diagnostic",
      "overlay:error",
      "bridge:ack",
      "bridge:nack",
      "bridge:ping",
      "bridge:pong",
    ]);
    expect(BRIDGE_MESSAGE_SPECS["overlay:init"]).toEqual({
      direction: "sdk-to-overlay",
      requiresAck: true,
    });
    expect(BRIDGE_MESSAGE_SPECS["overlay:navigation_context"]).toEqual({
      direction: "sdk-to-overlay",
      requiresAck: false,
    });
    expect(BRIDGE_MESSAGE_SPECS["overlay:diagnostic"]).toEqual({
      direction: "overlay-to-sdk",
      requiresAck: false,
    });
    expect(BRIDGE_MESSAGE_SPECS["bridge:ack"]).toEqual({
      direction: "generic",
      requiresAck: false,
    });
    expect(BRIDGE_RETRY_POLICY).toEqual({
      ackTimeoutMs: 1500,
      maxRetries: 2,
      backoffMs: [300, 800],
    });
  });

  it("matches the minimum protocol error code set", () => {
    expect(BRIDGE_ERROR_CODES).toEqual([
      "BRG_ORIGIN_MISMATCH",
      "BRG_PROTOCOL_VERSION_UNSUPPORTED",
      "BRG_SCHEMA_INVALID",
      "BRG_UNKNOWN_MESSAGE_TYPE",
      "BRG_ACK_TIMEOUT",
      "BRG_OVERLAY_TOKEN_EXPIRED",
      "BRG_OVERLAY_TOKEN_INVALID",
      "BRG_IFRAME_UNAVAILABLE",
      "BRG_IFRAME_BLOCKED_BY_CSP",
      "BRG_COMMAND_NOT_ALLOWED",
      "BRG_RATE_LIMITED",
      "BRG_INTERNAL_ERROR",
    ]);
  });
});

describe("bridge validation", () => {
  it("accepts a valid overlay:init message", () => {
    const result = validateBridgeMessageType(
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:init",
        messageId: "msg-1",
        sequence: 1,
        sentAtMs: Date.now(),
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          selectedVersion: BRIDGE_VERSION,
          parentOrigin: "https://host.example.com",
          overlayToken: "overlay-token",
          overlayTokenExpiresAt: "2026-03-31T00:00:00.000Z",
          selectedCapabilities: ["agent_audio", "task_prompts"],
          context: {
            organizationId: 1,
            studyId: 2,
            sectionId: 3,
            sessionId: "session-1",
            participantId: "participant-1",
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
      "overlay:init",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.type).toBe("overlay:init");
      expect(result.value.payload.selectedCapabilities).toEqual(["agent_audio", "task_prompts"]);
    }
  });

  it("accepts representative valid messages across the v1 catalog", () => {
    const messages = [
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:hello",
        messageId: "msg-hello",
        sequence: 2,
        sentAtMs: 1,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          overlayInstanceId: "overlay-1",
          supportedVersions: [BRIDGE_VERSION],
          capabilities: ["agent_audio", "token_refresh"],
          overlayBuild: "build-123",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:ready",
        messageId: "msg-ready",
        sequence: 3,
        sentAtMs: 2,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        correlationId: "msg-init",
        requiresAck: true,
        payload: {
          overlayInstanceId: "overlay-1",
          acceptedCapabilities: ["agent_audio"],
          media: {
            audioReady: true,
            videoReady: false,
          },
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:task_update",
        messageId: "msg-task",
        sequence: 4,
        sentAtMs: 3,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          activeTaskId: "task-1",
          tasks: [
            {
              id: "task-1",
              status: "active",
              instruction: "Find a pricing page",
              maxDurationSeconds: 30,
            },
          ],
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:navigation_context",
        messageId: "msg-nav",
        sequence: 5,
        sentAtMs: 4,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: false,
        payload: {
          pageUrl: "https://host.example.com/pricing",
          pagePath: "/pricing",
          routeType: "history",
          timestampMs: 4,
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:session_state",
        messageId: "msg-session",
        sequence: 6,
        sentAtMs: 5,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          state: "paused",
          reason: "participant_paused",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:token_refresh",
        messageId: "msg-refresh",
        sequence: 7,
        sentAtMs: 6,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          overlayToken: "overlay-token-2",
          overlayTokenExpiresAt: "2026-03-31T00:01:00.000Z",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:shutdown",
        messageId: "msg-shutdown",
        sequence: 8,
        sentAtMs: 7,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: true,
        payload: {
          reason: "manual_teardown",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:ui_command",
        messageId: "msg-ui",
        sequence: 9,
        sentAtMs: 8,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        requiresAck: true,
        payload: {
          command: "set_overlay_size_hint",
          args: { width: 480 },
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:session_action",
        messageId: "msg-action",
        sequence: 10,
        sentAtMs: 9,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        requiresAck: true,
        payload: {
          action: "task_complete",
          taskId: "task-1",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:token_refresh_request",
        messageId: "msg-refresh-request",
        sequence: 11,
        sentAtMs: 10,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        requiresAck: true,
        payload: {
          reason: "expiring",
          expiresAt: "2026-03-31T00:00:59.000Z",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:diagnostic",
        messageId: "msg-diagnostic",
        sequence: 12,
        sentAtMs: 11,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        requiresAck: false,
        payload: {
          level: "warn",
          code: "OVERLAY_SLOW_START",
          message: "Overlay took longer than expected",
          details: { durationMs: 5100 },
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:error",
        messageId: "msg-error",
        sequence: 13,
        sentAtMs: 12,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        overlayInstanceId: "overlay-1",
        requiresAck: false,
        payload: {
          code: "BRG_OVERLAY_TOKEN_EXPIRED",
          message: "Overlay token expired",
          retryable: true,
          fatal: false,
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:ack",
        messageId: "msg-ack",
        sequence: 14,
        sentAtMs: 13,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        correlationId: "msg-ready",
        requiresAck: false,
        payload: {
          ackMessageId: "msg-ready",
          status: "ok",
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:nack",
        messageId: "msg-nack",
        sequence: 15,
        sentAtMs: 14,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        correlationId: "msg-command",
        requiresAck: false,
        payload: {
          ackMessageId: "msg-command",
          status: "rejected",
          code: "BRG_COMMAND_NOT_ALLOWED",
          message: "Command not allowed",
          retryable: false,
        },
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:ping",
        messageId: "msg-ping",
        sequence: 16,
        sentAtMs: 15,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: false,
        payload: {},
      },
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:pong",
        messageId: "msg-pong",
        sequence: 17,
        sentAtMs: 16,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        correlationId: "msg-ping",
        requiresAck: false,
        payload: {},
      },
    ] as const;

    for (const message of messages) {
      expect(validateBridgeMessage(message)).toMatchObject({ success: true });
    }
  });

  it("rejects unknown message types with an explicit diagnostic code", () => {
    const result = validateBridgeMessage({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      type: "overlay:unknown",
      messageId: "msg-unknown",
      sequence: 1,
      sentAtMs: 1,
      sessionId: "session-1",
      bridgeInstanceId: "bridge-1",
      payload: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BRG_UNKNOWN_MESSAGE_TYPE");
      expect(result.error.issues).toContainEqual({
        code: "BRG_UNKNOWN_MESSAGE_TYPE",
        path: "type",
        message: "Unknown bridge message type",
      });
    }
  });

  it("rejects unsupported versions", () => {
    const result = validateBridgeMessage({
      namespace: BRIDGE_NAMESPACE,
      version: "2.0",
      type: "bridge:ping",
      messageId: "msg-version",
      sequence: 1,
      sentAtMs: 1,
      sessionId: "session-1",
      bridgeInstanceId: "bridge-1",
      requiresAck: false,
      payload: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BRG_PROTOCOL_VERSION_UNSUPPORTED");
    }
  });

  it("rejects invalid payloads and mismatched ack semantics", () => {
    const result = validateBridgeMessage({
      namespace: BRIDGE_NAMESPACE,
      version: BRIDGE_VERSION,
      type: "overlay:ready",
      messageId: "msg-bad-ready",
      sequence: 1,
      sentAtMs: 1,
      sessionId: "session-1",
      bridgeInstanceId: "bridge-1",
      requiresAck: false,
      payload: {
        overlayInstanceId: "overlay-1",
        acceptedCapabilities: ["not_real"],
        media: {
          audioReady: "yes",
          videoReady: false,
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("BRG_SCHEMA_INVALID");
      expect(result.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          "requiresAck",
          "payload.acceptedCapabilities[0]",
          "payload.media.audioReady",
        ]),
      );
    }
  });

  it("narrows validation for an expected message type", () => {
    const result = validateBridgeMessageType(
      {
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "overlay:diagnostic",
        messageId: "msg-diagnostic",
        sequence: 1,
        sentAtMs: 1,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: false,
        payload: {
          level: "info",
          code: "OVERLAY_BOOT",
          message: "Overlay booted",
        },
      },
      "overlay:diagnostic",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.payload.level).toBe("info");
    }
  });

  it("asserts valid messages and throws on invalid ones", () => {
    expect(() =>
      assertBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:ping",
        messageId: "msg-ping",
        sequence: 1,
        sentAtMs: 1,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: false,
        payload: {},
      }),
    ).not.toThrow();

    expect(() =>
      assertBridgeMessage({
        namespace: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: "bridge:ping",
        messageId: "",
        sequence: 1,
        sentAtMs: 1,
        sessionId: "session-1",
        bridgeInstanceId: "bridge-1",
        requiresAck: false,
        payload: {},
      }),
    ).toThrow(/BRG_SCHEMA_INVALID/);
  });
});
