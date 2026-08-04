import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateTriggers,
  evaluateTriggersWithDiagnostics,
  isCooldownExpired,
  matchesFilter,
  matchesUrl,
  setCooldown,
} from "../evaluation-engine/evaluation-engine.js";
import type { GlobalSettings, StudyContent, TriggerFilter } from "../types/index.js";

const defaultGlobalSettings: GlobalSettings = {
  cooldownDays: 14,
  sessionTimeoutMs: 1_800_000,
};

function makeStudy(overrides: Partial<StudyContent> = {}): StudyContent {
  return {
    id: 1,
    shareUrl: "study-abc",
    title: "Test Study",
    type: "interview",
    experienceMode: "interview",
    sections: [],
    branding: {
      logoUrl: null,
      organizationName: "Test Org",
      theme: null,
    },
    triggers: [
      {
        eventName: "checkout_completed",
        filters: [],
        isActive: true,
        priority: 0,
      },
    ],
    ...overrides,
  };
}

describe("evaluateTriggers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("matches on exact eventName", () => {
    const study = makeStudy();
    const result = evaluateTriggers("checkout_completed", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBe(study);
  });

  it("returns null for non-matching eventName", () => {
    const study = makeStudy();
    const result = evaluateTriggers("signup_completed", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBeNull();
  });

  it("returns only the first matching study (highest priority)", () => {
    const lowPriorityStudy = makeStudy({
      id: 1,
      triggers: [{ eventName: "click", filters: [], isActive: true, priority: 1 }],
    });
    const highPriorityStudy = makeStudy({
      id: 2,
      shareUrl: "study-high",
      title: "High Priority",
      triggers: [{ eventName: "click", filters: [], isActive: true, priority: 10 }],
    });

    const result = evaluateTriggers(
      "click",
      {},
      {},
      [lowPriorityStudy, highPriorityStudy],
      defaultGlobalSettings,
    );
    expect(result?.id).toBe(2);
  });

  it("skips studies with no triggers", () => {
    const study = makeStudy({ triggers: [] });
    const result = evaluateTriggers("anything", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBeNull();
  });

  it("skips inactive triggers", () => {
    const study = makeStudy({
      triggers: [{ eventName: "click", filters: [], isActive: false, priority: 0 }],
    });
    const result = evaluateTriggers("click", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBeNull();
  });

  it("skips studies on cooldown", () => {
    const study = makeStudy({ id: 42 });
    setCooldown(42);

    const result = evaluateTriggers("checkout_completed", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBeNull();
  });

  it("returns study when cooldown has expired", () => {
    const study = makeStudy({ id: 42 });
    // Set cooldown in the past (15 days ago, default cooldown is 14 days)
    localStorage.setItem("insightfull_cooldown_42", String(Date.now() - 15 * 24 * 60 * 60 * 1000));

    const result = evaluateTriggers("checkout_completed", {}, {}, [study], defaultGlobalSettings);
    expect(result).toBe(study);
  });
});

describe("evaluateTriggersWithDiagnostics", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("explains a matched study without including participant or configured values", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "checkout_completed",
          filters: [{ property: "account.plan", operator: "equals", value: "enterprise" }],
          isActive: true,
          priority: 4,
        },
      ],
    });

    const result = evaluateTriggersWithDiagnostics(
      "checkout_completed",
      { account: { plan: "enterprise" } },
      {},
      [study],
      defaultGlobalSettings,
      "/checkout",
      1_000,
    );

    expect(result.matchedStudy).toBe(study);
    expect(result.evaluation).toMatchObject({
      eventName: "checkout_completed",
      outcome: "matched",
      pathname: "/checkout",
      reasonCode: "matched",
      selectedStudyId: 1,
      timestamp: 1_000,
    });
    expect(result.evaluation.studies[0]?.triggers[0]?.filters).toEqual([
      { matched: true, operator: "equals", property: "account.plan" },
    ]);
    expect(JSON.stringify(result.evaluation)).not.toContain("enterprise");
  });

  it("reports the most actionable mismatch reason", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "checkout_completed",
          filters: [{ property: "plan", operator: "equals", value: "pro" }],
          isActive: true,
          priority: 0,
        },
      ],
    });

    const { evaluation } = evaluateTriggersWithDiagnostics(
      "checkout_completed",
      { plan: "free" },
      {},
      [study],
      defaultGlobalSettings,
    );

    expect(evaluation).toMatchObject({
      outcome: "not_matched",
      reasonCode: "no_matching_study",
      selectedStudyId: null,
    });
    expect(evaluation.studies[0]).toMatchObject({
      outcome: "not_matched",
      reasonCode: "filter_mismatch",
    });
    expect(evaluation.studies[0]?.triggers[0]).toMatchObject({
      outcome: "not_matched",
      reasonCode: "filter_mismatch",
    });
  });

  it("marks lower-priority matches as suppressed", () => {
    const lowPriorityStudy = makeStudy({
      id: 1,
      triggers: [{ eventName: "checkout", filters: [], isActive: true, priority: 1 }],
    });
    const highPriorityStudy = makeStudy({
      id: 2,
      triggers: [{ eventName: "checkout", filters: [], isActive: true, priority: 10 }],
    });

    const result = evaluateTriggersWithDiagnostics(
      "checkout",
      {},
      {},
      [lowPriorityStudy, highPriorityStudy],
      defaultGlobalSettings,
    );

    expect(result.matchedStudy?.id).toBe(2);
    expect(result.evaluation.studies).toEqual([
      expect.objectContaining({ studyId: 2, outcome: "matched", reasonCode: "matched" }),
      expect.objectContaining({
        studyId: 1,
        outcome: "suppressed",
        reasonCode: "another_study_selected",
      }),
    ]);
  });

  it("distinguishes inactive, URL, cooldown, and missing-trigger exclusions", () => {
    localStorage.setItem("insightfull_cooldown_4", "900");
    const studies = [
      makeStudy({ id: 1, triggers: [] }),
      makeStudy({
        id: 2,
        triggers: [{ eventName: "checkout", filters: [], isActive: false, priority: 2 }],
      }),
      makeStudy({
        id: 3,
        triggers: [
          {
            eventName: "/settings/*",
            filters: [],
            isActive: true,
            matchOn: "url",
            priority: 3,
          },
        ],
      }),
      makeStudy({ id: 4 }),
    ];

    const { evaluation } = evaluateTriggersWithDiagnostics(
      "pageview",
      {},
      {},
      studies,
      defaultGlobalSettings,
      "/checkout",
      1_000,
    );

    expect(
      Object.fromEntries(evaluation.studies.map((study) => [study.studyId, study.reasonCode])),
    ).toEqual({
      1: "study_has_no_triggers",
      2: "trigger_inactive",
      3: "url_mismatch",
      4: "cooldown_active",
    });
  });

  it("returns a distinct empty-environment explanation", () => {
    const { evaluation } = evaluateTriggersWithDiagnostics(
      "checkout",
      {},
      {},
      [],
      defaultGlobalSettings,
    );

    expect(evaluation).toMatchObject({
      outcome: "not_matched",
      reasonCode: "no_studies",
      selectedStudyId: null,
      studies: [],
    });
  });
});

describe("matchesFilter", () => {
  it("matches 'equals' operator with exact value", () => {
    const filter: TriggerFilter = {
      property: "plan",
      operator: "equals",
      value: "pro",
    };
    expect(matchesFilter(filter, { plan: "pro" }, {})).toBe(true);
    expect(matchesFilter(filter, { plan: "free" }, {})).toBe(false);
  });

  it("matches 'equals' is case-sensitive", () => {
    const filter: TriggerFilter = {
      property: "plan",
      operator: "equals",
      value: "Pro",
    };
    expect(matchesFilter(filter, { plan: "pro" }, {})).toBe(false);
    expect(matchesFilter(filter, { plan: "Pro" }, {})).toBe(true);
  });

  it("matches 'exists' operator for truthy values", () => {
    const filter: TriggerFilter = {
      property: "email",
      operator: "exists",
    };
    expect(matchesFilter(filter, { email: "test@example.com" }, {})).toBe(true);
    expect(matchesFilter(filter, { email: null }, {})).toBe(false);
    expect(matchesFilter(filter, { email: undefined }, {})).toBe(false);
  });

  it("resolves nested properties with dot notation", () => {
    const filter: TriggerFilter = {
      property: "user.plan",
      operator: "equals",
      value: "pro",
    };
    expect(matchesFilter(filter, { user: { plan: "pro" } }, {})).toBe(true);
    expect(matchesFilter(filter, { user: { plan: "free" } }, {})).toBe(false);
  });

  it("resolves customId.* properties", () => {
    const filter: TriggerFilter = {
      property: "customId.email",
      operator: "equals",
      value: "test@example.com",
    };
    expect(matchesFilter(filter, {}, { email: "test@example.com" })).toBe(true);
    expect(matchesFilter(filter, {}, { email: "other@example.com" })).toBe(false);
  });

  it("returns false for non-existent nested path", () => {
    const filter: TriggerFilter = {
      property: "a.b.c",
      operator: "exists",
    };
    expect(matchesFilter(filter, { a: {} }, {})).toBe(false);
  });

  it.each([
    ["not_equals", "plan", { plan: "free" }, "pro", true],
    ["not_equals", "plan", { plan: "pro" }, "pro", false],
    ["not_exists", "plan", {}, undefined, true],
    ["not_exists", "plan", { plan: "pro" }, undefined, false],
    ["contains", "roles", { roles: ["admin", "researcher"] }, "admin", true],
    ["contains", "roles", { roles: ["researcher"] }, "admin", false],
    ["contains", "company", { company: "Insightfull Labs" }, "full", true],
    ["not_contains", "company", { company: "Insightfull Labs" }, "Sprig", true],
    ["not_contains", "company", { company: "Insightfull Labs" }, "full", false],
    ["greater_than", "seats", { seats: 25 }, 10, true],
    ["greater_than", "seats", { seats: 10 }, 10, false],
    ["greater_than", "seats", { seats: "25" }, 10, false],
    ["less_than", "seats", { seats: 5 }, 10, true],
    ["less_than", "seats", { seats: 10 }, 10, false],
  ] as const)("evaluates %s for %s", (operator, property, attributes, value, expected) => {
    expect(matchesFilter({ operator, property, value }, attributes, {})).toBe(expected);
  });

  it("filter evaluation — all filters must match", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "purchase",
          filters: [
            { property: "plan", operator: "equals", value: "pro" },
            { property: "email", operator: "exists" },
          ],
          isActive: true,
          priority: 0,
        },
      ],
    });

    // Both match
    expect(
      evaluateTriggers(
        "purchase",
        { plan: "pro", email: "a@b.com" },
        {},
        [study],
        defaultGlobalSettings,
      ),
    ).toBe(study);

    // Only one matches
    expect(
      evaluateTriggers("purchase", { plan: "pro" }, {}, [study], defaultGlobalSettings),
    ).toBeNull();

    // Neither matches
    expect(
      evaluateTriggers("purchase", { plan: "free" }, {}, [study], defaultGlobalSettings),
    ).toBeNull();
  });
});

describe("cooldown", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("isCooldownExpired returns true when no cooldown set", () => {
    expect(isCooldownExpired(1, 14)).toBe(true);
  });

  it("setCooldown stores timestamp and isCooldownExpired returns false", () => {
    setCooldown(1);
    expect(isCooldownExpired(1, 14)).toBe(false);
  });

  it("isCooldownExpired returns true after cooldown period", () => {
    localStorage.setItem("insightfull_cooldown_1", String(Date.now() - 15 * 24 * 60 * 60 * 1000));
    expect(isCooldownExpired(1, 14)).toBe(true);
  });
});

describe("matchesUrl", () => {
  it("matches exact path", () => {
    expect(matchesUrl("/pricing", "/pricing")).toBe(true);
  });

  it("does not match different paths", () => {
    expect(matchesUrl("/pricing", "/about")).toBe(false);
  });

  it("matches with single wildcard *", () => {
    expect(matchesUrl("/products/*", "/products/widget")).toBe(true);
  });

  it("single wildcard * matches trailing slash", () => {
    expect(matchesUrl("/products/*", "/products/")).toBe(true);
  });

  it("single wildcard * does not match bare path", () => {
    expect(matchesUrl("/products/*", "/products")).toBe(false);
  });

  it("matches with globstar **", () => {
    expect(matchesUrl("/docs/**", "/docs/getting-started")).toBe(true);
    expect(matchesUrl("/docs/**", "/docs/api/v2/endpoints")).toBe(true);
  });

  it("matches root path exactly", () => {
    expect(matchesUrl("/", "/")).toBe(true);
    expect(matchesUrl("/", "/about")).toBe(false);
  });

  it("requires exact match when no wildcards", () => {
    expect(matchesUrl("/about", "/about")).toBe(true);
    expect(matchesUrl("/about", "/about-us")).toBe(false);
    expect(matchesUrl("/about", "/company/about")).toBe(false);
  });

  it("handles ? single character wildcard", () => {
    expect(matchesUrl("/item-?", "/item-a")).toBe(true);
    expect(matchesUrl("/item-?", "/item-ab")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(matchesUrl("/Pricing", "/pricing")).toBe(false);
    expect(matchesUrl("/Pricing", "/Pricing")).toBe(true);
  });
});

describe("evaluateTriggers with matchOn", () => {
  const defaultGlobalSettings: GlobalSettings = {
    cooldownDays: 14,
    sessionTimeoutMs: 1_800_000,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns matching study when matchOn is url and pattern matches", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/pricing",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    const result = evaluateTriggers("pageview", {}, {}, [study], defaultGlobalSettings, "/pricing");

    expect(result).toBe(study);
  });

  it("returns null when matchOn is url and pattern does not match", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/pricing",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    const result = evaluateTriggers("pageview", {}, {}, [study], defaultGlobalSettings, "/about");

    expect(result).toBeNull();
  });

  it("returns null when matchOn is url but event is not pageview", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/pricing",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    const result = evaluateTriggers(
      "cta_click",
      {},
      {},
      [study],
      defaultGlobalSettings,
      "/pricing",
    );

    expect(result).toBeNull();
  });

  it("returns null when matchOn is url but no currentUrl provided", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/pricing",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    const result = evaluateTriggers("pageview", {}, {}, [study], defaultGlobalSettings);

    expect(result).toBeNull();
  });

  it("applies audience filters to URL triggers", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/pricing",
          filters: [
            { operator: "equals", property: "plan", value: "free" },
            { operator: "greater_than", property: "seats", value: 2 },
          ],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    expect(
      evaluateTriggers(
        "pageview",
        { plan: "free", seats: 3 },
        {},
        [study],
        defaultGlobalSettings,
        "/pricing",
      ),
    ).toBe(study);
    expect(
      evaluateTriggers(
        "pageview",
        { plan: "pro", seats: 3 },
        {},
        [study],
        defaultGlobalSettings,
        "/pricing",
      ),
    ).toBeNull();
  });

  it("defaults to event matching when matchOn is undefined", () => {
    const study = makeStudy({
      triggers: [{ eventName: "cta_click", filters: [], isActive: true, priority: 1 }],
    });

    const result = evaluateTriggers(
      "cta_click",
      {},
      {},
      [study],
      defaultGlobalSettings,
      "/irrelevant",
    );

    expect(result).toBe(study);
  });

  it("url and event triggers coexist independently", () => {
    const eventStudy = makeStudy({
      id: 1,
      triggers: [
        {
          eventName: "cta_click",
          filters: [],
          isActive: true,
          matchOn: "event",
          priority: 1,
        },
      ],
    });
    const urlStudy = makeStudy({
      id: 2,
      shareUrl: "study-url",
      title: "URL Study",
      triggers: [
        {
          eventName: "/pricing",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    // Event match
    const eventResult = evaluateTriggers(
      "cta_click",
      {},
      {},
      [eventStudy, urlStudy],
      defaultGlobalSettings,
      "/other",
    );
    expect(eventResult?.id).toBe(1);

    // URL match
    const urlResult = evaluateTriggers(
      "pageview",
      {},
      {},
      [eventStudy, urlStudy],
      defaultGlobalSettings,
      "/pricing",
    );
    expect(urlResult?.id).toBe(2);

    // Neither matches
    const noMatch = evaluateTriggers(
      "signup",
      {},
      {},
      [eventStudy, urlStudy],
      defaultGlobalSettings,
      "/about",
    );
    expect(noMatch).toBeNull();
  });

  it("matches URL with globstar pattern", () => {
    const study = makeStudy({
      triggers: [
        {
          eventName: "/docs/**",
          filters: [],
          isActive: true,
          matchOn: "url",
          priority: 1,
        },
      ],
    });

    const result = evaluateTriggers(
      "pageview",
      {},
      {},
      [study],
      defaultGlobalSettings,
      "/docs/getting-started/install",
    );

    expect(result).toBe(study);
  });
});
