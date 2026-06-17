import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutoTracker } from "../auto-tracker/auto-tracker.js";

describe("AutoTracker", () => {
  let tracker: AutoTracker;
  let trackedEvents: Array<{
    eventName: string;
    payload?: Record<string, unknown>;
  }>;
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  beforeEach(() => {
    // Save original methods before each test
    originalPushState = history.pushState.bind(history);
    originalReplaceState = history.replaceState.bind(history);

    trackedEvents = [];
    tracker = new AutoTracker((eventName, payload) => {
      trackedEvents.push(payload !== undefined ? { eventName, payload } : { eventName });
    });
    // Reset history state
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    // Stop tracker
    tracker.stop();

    // Always restore history methods to original
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  it("tracks initial pageview on start", () => {
    tracker.start();

    expect(trackedEvents).toHaveLength(1);
    expect(trackedEvents[0]!.eventName).toBe("pageview");
    expect(trackedEvents[0]!.payload?.path).toBe("/");
  });

  it("intercepts pushState", () => {
    tracker.start();
    trackedEvents.length = 0; // Clear initial pageview

    history.pushState({}, "", "/new-page");

    expect(trackedEvents).toHaveLength(1);
    expect(trackedEvents[0]!.eventName).toBe("pageview");
    expect(trackedEvents[0]!.payload?.path).toBe("/new-page");
  });

  it("intercepts replaceState", () => {
    tracker.start();
    trackedEvents.length = 0;

    history.replaceState({}, "", "/replaced");

    expect(trackedEvents).toHaveLength(1);
    expect(trackedEvents[0]!.eventName).toBe("pageview");
    expect(trackedEvents[0]!.payload?.path).toBe("/replaced");
  });

  it("handles popstate events", () => {
    tracker.start();
    trackedEvents.length = 0;

    // Push state first so we have history
    history.pushState({}, "", "/page1");
    trackedEvents.length = 0;

    // Trigger popstate (simulating back button)
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(trackedEvents).toHaveLength(1);
    expect(trackedEvents[0]!.eventName).toBe("pageview");
  });

  it("stop restores original history methods", () => {
    tracker.start();
    trackedEvents.length = 0;

    tracker.stop();

    // Restore originals so afterEach doesn't double-restore
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    // After stop, calling pushState should NOT trigger a track
    history.pushState({}, "", "/after-stop");

    expect(trackedEvents).toHaveLength(0);
  });

  it("tracks URL in pageview payload", () => {
    tracker.start();
    const event = trackedEvents[0]!;
    expect(event.payload?.url).toContain("/");
  });

  it("does not track after stop is called for popstate", () => {
    tracker.start();
    trackedEvents.length = 0;

    tracker.stop();

    // Restore originals so afterEach doesn't double-restore
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(trackedEvents).toHaveLength(0);
  });
});
