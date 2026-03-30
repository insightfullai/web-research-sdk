import { describe, expect, it } from "vitest";
import { createOverlayProviderProps } from "./index";

describe("createOverlayProviderProps", () => {
  it("uses a default mount id", () => {
    const props = createOverlayProviderProps({ children: null });

    expect(props.mountId).toBe("insightfull-overlay-root");
  });
});
