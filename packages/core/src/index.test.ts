import { describe, expect, it } from "vitest";
import { createWebResearchClient } from "./index";

describe("createWebResearchClient", () => {
  it("creates a client with a session id", () => {
    const client = createWebResearchClient({ apiKey: "test-key" });
    const session = client.getSession();

    expect(session.sessionId).toHaveLength(36);
  });

  it("requires an api key", () => {
    expect(() => createWebResearchClient({ apiKey: "" })).toThrowError("apiKey is required");
  });
});
