import { describe, expect, it } from "vitest";
import type { SdkEvent } from "./index";

describe("shared types", () => {
  it("shape can represent sdk events", () => {
    const event: SdkEvent = {
      name: "session.started",
      payload: { source: "unit-test" },
    };

    expect(event.name).toBe("session.started");
  });
});
