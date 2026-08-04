import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelemetry } from "../telemetry-sender/telemetry-sender.js";
import type { DeliveryEvent, PageviewEvent } from "../types/index.js";

describe("sendTelemetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes the SDK version as first-class integration diagnostics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { ingested: 1 } } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pageviewEvent: PageviewEvent = {
      name: "/checkout",
      timestamp: 1,
      type: "pageview",
      url: "https://app.example/checkout",
    };

    await sendTelemetry(
      "https://insightfull.example",
      "env_test",
      "visitor_test",
      "user_test",
      [pageviewEvent],
      "1.2.3",
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof request.body !== "string") {
      throw new Error("Expected telemetry request body to be a JSON string");
    }
    expect(JSON.parse(request.body)).toMatchObject({
      clientId: "env_test",
      events: [
        {
          eventName: "/checkout",
          eventType: "pageview",
          sdkVersion: "1.2.3",
          url: "https://app.example/checkout",
          userId: "user_test",
          visitorId: "visitor_test",
        },
      ],
    });
  });

  it("sends privacy-safe delivery decisions as first-class telemetry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { data: { ingested: 1 } } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deliveryEvent: DeliveryEvent = {
      payload: {
        eventName: "checkout_completed",
        outcome: "not_matched",
        reasonCode: "no_matching_study",
        selectedStudyId: null,
        studies: [
          {
            outcome: "not_matched",
            reasonCode: "filter_mismatch",
            studyId: 17,
            triggers: [
              {
                filters: [{ matched: false, operator: "equals", property: "plan" }],
                reasonCode: "filter_mismatch",
              },
            ],
          },
        ],
      },
      timestamp: 1,
      type: "delivery",
      url: "/checkout",
    };

    await sendTelemetry(
      "https://insightfull.example",
      "env_test",
      "visitor_test",
      null,
      [deliveryEvent],
      "1.2.3",
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof request.body !== "string") {
      throw new Error("Expected telemetry request body to be a JSON string");
    }
    expect(JSON.parse(request.body)).toMatchObject({
      events: [
        {
          eventType: "delivery",
          payload: {
            eventName: "checkout_completed",
            outcome: "not_matched",
            studies: [
              {
                reasonCode: "filter_mismatch",
                studyId: 17,
              },
            ],
          },
          sdkVersion: "1.2.3",
          url: "/checkout",
          visitorId: "visitor_test",
        },
      ],
    });
  });
});
