import { describe, expect, it } from "vitest";

import {
  buildValidWebResearchHandshakeInitFixture,
  buildValidWebResearchHandshakeReadyFixture,
  buildValidWebResearchTaskAbandonSignalFixture,
  buildValidWebResearchTaskCompleteSignalFixture,
  buildValidWebResearchBatchFixture,
  buildValidWebResearchCompleteFixture,
  parseWebResearchBatchMessage,
  parseWebResearchCompleteMessage,
  parseWebResearchHandshakeInitMessage,
  parseWebResearchHandshakeReadyMessage,
  parseWebResearchMessage,
  parseWebResearchTaskAbandonSignalMessage,
  parseWebResearchTaskCompleteSignalMessage,
  WEB_RESEARCH_PROTOCOL_VERSION,
} from "./index";

describe("contracts schema parsing", () => {
  it("accepts valid batch and complete fixtures", () => {
    const batchFixture = buildValidWebResearchBatchFixture();
    const completeFixture = buildValidWebResearchCompleteFixture();

    const batchResult = parseWebResearchBatchMessage(batchFixture);
    const completeResult = parseWebResearchCompleteMessage(completeFixture);

    expect(batchResult.success).toBe(true);
    expect(completeResult.success).toBe(true);

    if (batchResult.success) {
      expect(batchResult.value.type).toBe("insightfull:web-research-batch");
      expect(batchResult.value.events).toHaveLength(2);
    }

    if (completeResult.success) {
      expect(completeResult.value.type).toBe("insightfull:web-research-batch:complete");
      expect(completeResult.value.session.environment).toBe("staging");
    }
  });

  it("accepts valid handshake init and ready fixtures", () => {
    const initResult = parseWebResearchHandshakeInitMessage(
      buildValidWebResearchHandshakeInitFixture(),
    );
    const readyResult = parseWebResearchHandshakeReadyMessage(
      buildValidWebResearchHandshakeReadyFixture(),
    );

    expect(initResult.success).toBe(true);
    expect(readyResult.success).toBe(true);
  });

  it("accepts valid task signal fixtures with status and evidence", () => {
    const completeResult = parseWebResearchTaskCompleteSignalMessage(
      buildValidWebResearchTaskCompleteSignalFixture(),
    );
    const abandonResult = parseWebResearchTaskAbandonSignalMessage(
      buildValidWebResearchTaskAbandonSignalFixture(),
    );

    expect(completeResult.success).toBe(true);
    expect(abandonResult.success).toBe(true);

    if (completeResult.success) {
      expect(completeResult.value.status).toBe("completed");
      expect(completeResult.value.evidence).toMatchObject({
        note: expect.any(String),
        metadata: expect.any(Object),
      });
    }

    if (abandonResult.success) {
      expect(abandonResult.value.status).toBe("abandoned");
      expect(abandonResult.value.evidence).toMatchObject({
        note: expect.any(String),
        metadata: expect.any(Object),
      });
    }
  });

  it("rejects malformed payloads", () => {
    const malformedBatch = {
      ...buildValidWebResearchBatchFixture(),
      events: {
        nope: true,
      },
    };

    const result = parseWebResearchMessage(malformedBatch);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.path === "events")).toBe(true);
    }
    expect("value" in result).toBe(false);
  });

  it("rejects missing and invalid environment", () => {
    const missingEnvironment = {
      ...buildValidWebResearchBatchFixture(),
      session: {
        sessionId: "session-1",
        startedAt: "2026-04-10T12:00:00.000Z",
      },
    };
    const invalidEnvironment = {
      ...buildValidWebResearchBatchFixture(),
      session: {
        ...buildValidWebResearchBatchFixture().session,
        environment: "qa",
      },
    };

    const missingResult = parseWebResearchMessage(missingEnvironment);
    const invalidResult = parseWebResearchMessage(invalidEnvironment);

    expect(missingResult.success).toBe(false);
    expect(invalidResult.success).toBe(false);

    if (!missingResult.success) {
      expect(missingResult.issues.some((issue) => issue.path === "session.environment")).toBe(true);
    }

    if (!invalidResult.success) {
      expect(invalidResult.issues.some((issue) => issue.path === "session.environment")).toBe(true);
    }
  });

  it("rejects unsupported version", () => {
    const unsupportedVersionMessage = {
      ...buildValidWebResearchCompleteFixture(),
      version: "2.0",
    };

    const result = parseWebResearchMessage(unsupportedVersionMessage);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((issue) => issue.code === "UNSUPPORTED_VERSION")).toBe(true);
    }
  });

  it("keeps protocol version policy closed to supported versions", () => {
    expect(WEB_RESEARCH_PROTOCOL_VERSION).toBe("1.0");
  });

  describe("payload depth validation", () => {
    it("accepts payload at depth 5", () => {
      const fixture = buildValidWebResearchBatchFixture();
      const depth5 = { a: { b: { c: { d: {} } } } };
      fixture.events = [
        {
          id: "event-1",
          name: "navigation",
          capturedAt: "2026-04-10T12:00:01.000Z",
          sessionId: "session-1",
          source: "browser",
          payload: depth5,
        },
      ];

      const result = parseWebResearchBatchMessage(fixture);
      expect(result.success).toBe(true);
    });

    it("rejects payload at depth 6 with depth error", () => {
      const fixture = buildValidWebResearchBatchFixture();
      const depth6 = { a: { b: { c: { d: { e: {} } } } } };
      fixture.events = [
        {
          id: "event-1",
          name: "navigation",
          capturedAt: "2026-04-10T12:00:01.000Z",
          sessionId: "session-1",
          source: "browser",
          payload: depth6,
        },
      ];

      const result = parseWebResearchBatchMessage(fixture);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.some((issue) => issue.message.includes("depth exceeds maximum"))).toBe(true);
      }
    });

    it("rejects payload exceeding 10KB with size error", () => {
      const fixture = buildValidWebResearchBatchFixture();
      const largeValue = "x".repeat(11000);
      fixture.events = [
        {
          id: "event-1",
          name: "navigation",
          capturedAt: "2026-04-10T12:00:01.000Z",
          sessionId: "session-1",
          source: "browser",
          payload: { data: largeValue },
        },
      ];

      const result = parseWebResearchBatchMessage(fixture);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.some((issue) => issue.message.includes("size exceeds maximum"))).toBe(true);
      }
    });

    it("accepts valid small payload", () => {
      const fixture = buildValidWebResearchBatchFixture();
      fixture.events = [
        {
          id: "event-1",
          name: "navigation",
          capturedAt: "2026-04-10T12:00:01.000Z",
          sessionId: "session-1",
          source: "browser",
          payload: { path: "/home", routeType: "history" },
        },
      ];

      const result = parseWebResearchBatchMessage(fixture);
      expect(result.success).toBe(true);
    });
  });
});
