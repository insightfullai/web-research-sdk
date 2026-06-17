import { beforeEach, describe, expect, it } from "vitest";
import {
	evaluateTriggers,
	isCooldownExpired,
	matchesFilter,
	matchesUrl,
	setCooldown,
} from "../evaluation-engine/evaluation-engine.js";
import type {
	GlobalSettings,
	StudyContent,
	TriggerFilter,
} from "../types/index.js";

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
		const result = evaluateTriggers(
			"checkout_completed",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBe(study);
	});

	it("returns null for non-matching eventName", () => {
		const study = makeStudy();
		const result = evaluateTriggers(
			"signup_completed",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBeNull();
	});

	it("returns only the first matching study (highest priority)", () => {
		const lowPriorityStudy = makeStudy({
			id: 1,
			triggers: [
				{ eventName: "click", filters: [], isActive: true, priority: 1 },
			],
		});
		const highPriorityStudy = makeStudy({
			id: 2,
			shareUrl: "study-high",
			title: "High Priority",
			triggers: [
				{ eventName: "click", filters: [], isActive: true, priority: 10 },
			],
		});

		const result = evaluateTriggers(
			"click",
			{},
			{},
			[lowPriorityStudy, highPriorityStudy],
			defaultGlobalSettings
		);
		expect(result?.id).toBe(2);
	});

	it("skips studies with no triggers", () => {
		const study = makeStudy({ triggers: [] });
		const result = evaluateTriggers(
			"anything",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBeNull();
	});

	it("skips inactive triggers", () => {
		const study = makeStudy({
			triggers: [
				{ eventName: "click", filters: [], isActive: false, priority: 0 },
			],
		});
		const result = evaluateTriggers(
			"click",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBeNull();
	});

	it("skips studies on cooldown", () => {
		const study = makeStudy({ id: 42 });
		setCooldown(42);

		const result = evaluateTriggers(
			"checkout_completed",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBeNull();
	});

	it("returns study when cooldown has expired", () => {
		const study = makeStudy({ id: 42 });
		// Set cooldown in the past (15 days ago, default cooldown is 14 days)
		localStorage.setItem(
			"insightfull_cooldown_42",
			String(Date.now() - 15 * 24 * 60 * 60 * 1000)
		);

		const result = evaluateTriggers(
			"checkout_completed",
			{},
			{},
			[study],
			defaultGlobalSettings
		);
		expect(result).toBe(study);
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
		expect(matchesFilter(filter, {}, { email: "other@example.com" })).toBe(
			false
		);
	});

	it("returns false for non-existent nested path", () => {
		const filter: TriggerFilter = {
			property: "a.b.c",
			operator: "exists",
		};
		expect(matchesFilter(filter, { a: {} }, {})).toBe(false);
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
				defaultGlobalSettings
			)
		).toBe(study);

		// Only one matches
		expect(
			evaluateTriggers(
				"purchase",
				{ plan: "pro" },
				{},
				[study],
				defaultGlobalSettings
			)
		).toBeNull();

		// Neither matches
		expect(
			evaluateTriggers(
				"purchase",
				{ plan: "free" },
				{},
				[study],
				defaultGlobalSettings
			)
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
		localStorage.setItem(
			"insightfull_cooldown_1",
			String(Date.now() - 15 * 24 * 60 * 60 * 1000)
		);
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

		const result = evaluateTriggers(
			"pageview",
			{},
			{},
			[study],
			defaultGlobalSettings,
			"/pricing"
		);

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

		const result = evaluateTriggers(
			"pageview",
			{},
			{},
			[study],
			defaultGlobalSettings,
			"/about"
		);

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
			"/pricing"
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

		const result = evaluateTriggers(
			"pageview",
			{},
			{},
			[study],
			defaultGlobalSettings
		);

		expect(result).toBeNull();
	});

	it("defaults to event matching when matchOn is undefined", () => {
		const study = makeStudy({
			triggers: [
				{ eventName: "cta_click", filters: [], isActive: true, priority: 1 },
			],
		});

		const result = evaluateTriggers(
			"cta_click",
			{},
			{},
			[study],
			defaultGlobalSettings,
			"/irrelevant"
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
			"/other"
		);
		expect(eventResult?.id).toBe(1);

		// URL match
		const urlResult = evaluateTriggers(
			"pageview",
			{},
			{},
			[eventStudy, urlStudy],
			defaultGlobalSettings,
			"/pricing"
		);
		expect(urlResult?.id).toBe(2);

		// Neither matches
		const noMatch = evaluateTriggers(
			"signup",
			{},
			{},
			[eventStudy, urlStudy],
			defaultGlobalSettings,
			"/about"
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
			"/docs/getting-started/install"
		);

		expect(result).toBe(study);
	});
});
