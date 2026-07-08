import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InsightfullIframeBridgeState,
  InsightfullIframeMessage,
  InsightfullRecorderSafeContext,
  InsightfullRecordingSessionMessage,
} from "@insightfull/web-research-sdk";

const recordMock = vi.hoisted(() => vi.fn());

vi.mock("rrweb", () => ({
  record: recordMock,
}));

import { attachInsightfullRecorder } from "../index.js";
import type { InsightfullRecorderCompatibleSDK, InsightfullRecordingChunk } from "../index.js";

interface RrwebRecordOptionsForTest {
  blockClass?: string | RegExp;
  emit: (event: unknown) => void;
  ignoreClass?: string;
  maskAllInputs?: unknown;
  maskAllText?: unknown;
  maskTextSelector?: string;
}

class FakeSDK implements InsightfullRecorderCompatibleSDK {
  bridgeState: InsightfullIframeBridgeState = {
    active: true,
    queueSize: 0,
    ready: true,
    studyId: 42,
    targetOrigin: "https://iframe.example.test",
  };
  readonly messages: InsightfullIframeMessage[] = [];
  recorderContext: InsightfullRecorderSafeContext = {
    activeStudyId: 42,
    customAttributes: { plan: "pro" },
    customId: { account: "acct_123" },
    path: "/checkout",
    sdkEnvironmentId: "env_test",
    url: "https://merchant.example.test/checkout",
    userId: null,
    visitorId: "visitor_123",
  };

  getIframeBridgeState(): InsightfullIframeBridgeState {
    return { ...this.bridgeState };
  }

  getRecorderContext(): InsightfullRecorderSafeContext {
    return {
      ...this.recorderContext,
      customAttributes: { ...this.recorderContext.customAttributes },
      customId: { ...this.recorderContext.customId },
    };
  }

  sendIframeBridgeMessage(message: InsightfullIframeMessage): boolean {
    this.messages.push(message);
    return true;
  }
}

function getRecordOptions(): RrwebRecordOptionsForTest {
  const options = recordMock.mock.calls.at(-1)?.[0] as RrwebRecordOptionsForTest | undefined;
  if (!options) {
    throw new Error("rrweb record was not called");
  }
  return options;
}

function emittedChunks(uploadChunk: ReturnType<typeof vi.fn>): InsightfullRecordingChunk[] {
  return uploadChunk.mock.calls.map((call) => call[0] as InsightfullRecordingChunk);
}

function isSessionMessage(
  message: InsightfullIframeMessage,
): message is InsightfullRecordingSessionMessage {
  return message.type === "insightfull.recording_session";
}

function sessionMessages(sdk: FakeSDK): InsightfullRecordingSessionMessage[] {
  return sdk.messages.filter(isSessionMessage);
}

describe("attachInsightfullRecorder", () => {
  let rrwebStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rrwebStop = vi.fn();
    recordMock.mockReset();
    recordMock.mockReturnValue(rrwebStop);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("attaches, starts recording when the iframe bridge is ready, and detaches as aborted", async () => {
    const sdk = new FakeSDK();
    const uploadChunk = vi.fn();

    const controller = attachInsightfullRecorder(sdk, { uploadChunk });

    expect(controller.getState()).toMatchObject({ state: "recording", activeStudyId: 42 });
    expect(recordMock).toHaveBeenCalledTimes(1);

    getRecordOptions().emit({ type: 3, data: { source: "mutation" } });
    await controller.detach();
    await controller.detach();

    expect(rrwebStop).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ state: "aborted", bufferedEvents: 0 });
    expect(emittedChunks(uploadChunk)).toHaveLength(1);
    expect(emittedChunks(uploadChunk)[0]).toMatchObject({
      reason: "detach",
      events: [{ type: 3, data: { source: "mutation" } }],
    });
  });

  it("waits for the bridge to become ready before starting rrweb", async () => {
    vi.useFakeTimers();
    const sdk = new FakeSDK();
    sdk.bridgeState = { ...sdk.bridgeState, ready: false };

    const controller = attachInsightfullRecorder(sdk, {
      iframeReadyPollIntervalMs: 25,
      iframeReadyTimeoutMs: 500,
    });

    expect(controller.getState().state).toBe("awaiting_iframe_ready");
    expect(recordMock).not.toHaveBeenCalled();

    sdk.bridgeState = { ...sdk.bridgeState, ready: true };
    await vi.advanceTimersByTimeAsync(25);

    expect(controller.getState().state).toBe("recording");
    expect(recordMock).toHaveBeenCalledTimes(1);
    await controller.detach();
  });

  it("returns to idle and polls for a later active bridge when readiness disappears", async () => {
    vi.useFakeTimers();
    const sdk = new FakeSDK();
    sdk.bridgeState = { ...sdk.bridgeState, ready: false };

    const controller = attachInsightfullRecorder(sdk, {
      iframeReadyPollIntervalMs: 25,
      iframeReadyTimeoutMs: 500,
    });

    sdk.bridgeState = { ...sdk.bridgeState, active: false, ready: false, studyId: null };
    await vi.advanceTimersByTimeAsync(25);

    expect(controller.getState().state).toBe("idle");
    expect(recordMock).not.toHaveBeenCalled();

    sdk.bridgeState = { ...sdk.bridgeState, active: true, ready: true, studyId: 42 };
    await vi.advanceTimersByTimeAsync(1000);

    expect(controller.getState().state).toBe("recording");
    expect(recordMock).toHaveBeenCalledTimes(1);
    await controller.detach();
  });

  it("does not auto-start when disabled, but manual start records once the bridge is ready", async () => {
    const sdk = new FakeSDK();

    const controller = attachInsightfullRecorder(sdk, { enabled: false });

    expect(controller.getState().state).toBe("idle");
    expect(recordMock).not.toHaveBeenCalled();

    controller.start();

    expect(controller.getState().state).toBe("recording");
    expect(recordMock).toHaveBeenCalledTimes(1);
    await controller.detach();
  });

  it("passes conservative privacy defaults and explicit rrweb overrides", async () => {
    const sdk = new FakeSDK();

    const defaultController = attachInsightfullRecorder(sdk);
    expect(recordMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        maskAllInputs: true,
        maskAllText: true,
        maskTextSelector: "*",
      }),
    );
    await defaultController.detach();

    const controller = attachInsightfullRecorder(sdk, {
      blockClass: "insightfull-block",
      ignoreClass: "insightfull-ignore",
      maskAllText: false,
    });

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockClass: "insightfull-block",
        ignoreClass: "insightfull-ignore",
        maskAllInputs: true,
        maskAllText: false,
      }),
    );
    expect(getRecordOptions().maskTextSelector).toBeUndefined();

    await controller.detach();
  });

  it("sanitizes recorder context and reuses the same safe context in the stopped message", async () => {
    const sdk = new FakeSDK();
    sdk.recorderContext = {
      activeStudyId: 999,
      customAttributes: {
        active: true,
        count: 2,
        empty: null,
        nested: { should: "drop" },
        plan: "pro",
      },
      customId: {
        account: "acct_123",
        unsafe: { should: "drop" },
      },
      path: "/checkout",
      responseId: "resp_unsafe",
      sdkEnvironmentId: "env_test",
      sectionResponseId: 7,
      url: "https://merchant.example.test/checkout?token=secret#fragment",
      userId: "user_123",
      visitorId: "visitor_123",
    } as unknown as InsightfullRecorderSafeContext;

    const controller = attachInsightfullRecorder(sdk);
    const startedMessage = sessionMessages(sdk)[0];

    expect(startedMessage?.context).toEqual({
      customAttributes: {
        active: true,
        count: 2,
        empty: null,
        plan: "pro",
      },
      customId: { account: "acct_123" },
      path: "/checkout",
      sdkEnvironmentId: "env_test",
      sectionResponseId: 7,
      studyId: 42,
      url: "https://merchant.example.test/checkout",
      userId: "user_123",
      visitorId: "visitor_123",
    });

    sdk.recorderContext = {
      ...sdk.recorderContext,
      customAttributes: { late: "do-not-leak" },
      url: "https://merchant.example.test/changed?token=late-secret",
    };

    await controller.stop();

    const stoppedMessage = sessionMessages(sdk).at(-1);
    expect(stoppedMessage?.state).toBe("stopped");
    expect(stoppedMessage?.context).toEqual(startedMessage?.context);
  });

  it("forwards live rrweb events through the SDK iframe bridge", async () => {
    const sdk = new FakeSDK();
    const controller = attachInsightfullRecorder(sdk);
    const event = { type: 3, timestamp: 123, data: { source: "input" } };

    getRecordOptions().emit(event);

    const sessionMessage = sdk.messages[0];
    const eventMessage = sdk.messages[1];
    expect(sessionMessage).toMatchObject({
      state: "started",
      type: "insightfull.recording_session",
      version: 1,
    });
    expect(eventMessage).toMatchObject({
      event,
      format: "rrweb",
      formatVersion: "2.1.0",
      recordingSessionId: controller.getState().recordingSessionId,
      type: "insightfull.recording_event",
      version: 1,
    });

    await controller.detach();
  });

  it("flushes chunks by event count cap and byte cap", async () => {
    const sdk = new FakeSDK();
    const uploadChunk = vi.fn();
    const controller = attachInsightfullRecorder(sdk, {
      maxBytesPerChunk: 24,
      maxEventsPerChunk: 2,
      uploadChunk,
    });
    const options = getRecordOptions();

    options.emit({ n: 1 });
    options.emit({ n: 2 });
    await Promise.resolve();
    options.emit({ payload: "this is large enough to trigger a byte flush" });
    await controller.stop();

    expect(emittedChunks(uploadChunk).map((chunk) => chunk.reason)).toEqual([
      "event_count",
      "byte_size",
    ]);
    expect(emittedChunks(uploadChunk)[0]?.events).toHaveLength(2);
    expect(emittedChunks(uploadChunk)[1]?.events).toHaveLength(1);
  });

  it("flushes the final partial chunk and sends a stopped session message on manual stop", async () => {
    const sdk = new FakeSDK();
    const createSession = vi.fn();
    const uploadChunk = vi.fn();
    const controller = attachInsightfullRecorder(sdk, {
      createSession,
      maxEventsPerChunk: 10,
      uploadChunk,
    });

    getRecordOptions().emit({ type: 3, data: { source: "mousemove" } });
    expect(uploadChunk).not.toHaveBeenCalled();

    await controller.stop();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(rrwebStop).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ state: "completed", bufferedEvents: 0 });
    expect(emittedChunks(uploadChunk)).toHaveLength(1);
    expect(emittedChunks(uploadChunk)[0]).toMatchObject({ reason: "manual_stop" });
    expect(sdk.messages.at(-1)).toMatchObject({
      state: "stopped",
      type: "insightfull.recording_session",
    });
  });

  it("flushes when the active SDK bridge closes", async () => {
    vi.useFakeTimers();
    const sdk = new FakeSDK();
    const uploadChunk = vi.fn();
    const controller = attachInsightfullRecorder(sdk, {
      flushIntervalMs: 20,
      uploadChunk,
    });

    getRecordOptions().emit({ type: 3, data: { source: "mutation" } });
    sdk.bridgeState = { ...sdk.bridgeState, active: false, ready: false, studyId: null };

    await vi.advanceTimersByTimeAsync(20);

    expect(controller.getState().state).toBe("completed");
    expect(emittedChunks(uploadChunk)[0]).toMatchObject({ reason: "study_closed" });
  });
});
