import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConfig } from "../config-fetcher/config-fetcher.js";

const mockConfig = {
	environment: {
		allowedDomains: null,
		clientId: "env_abc",
		isActive: true,
		name: "Test Environment",
	},
	globalSettings: { cooldownDays: 14, sessionTimeoutMs: 1_800_000 },
	studies: [
		{
			id: 1,
			shareUrl: "test",
			title: "Test Study",
			type: "interview",
			experienceMode: "interview",
			sections: [],
			branding: { logoUrl: null, organizationName: "Test Org", theme: null },
			triggers: [
				{ eventName: "click", filters: [], isActive: true, priority: 0 },
			],
		},
	],
};

describe("fetchConfig", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns parsed config on successful fetch", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ result: { data: mockConfig } }),
		} as Response);

		const result = await fetchConfig("https://app.insightfull.ai", "env_abc");

		expect(result).toEqual(mockConfig);
	});

	it("returns null for client errors (4xx)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: false,
			status: 404,
			json: async () => ({}),
		} as Response);

		const result = await fetchConfig(
			"https://app.insightfull.ai",
			"invalid_client"
		);

		expect(result).toBeNull();
	});

	it("retries on server errors and eventually returns config", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: async () => ({}),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 502,
				json: async () => ({}),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ result: { data: mockConfig } }),
			} as Response);

		const result = await fetchConfig("https://app.insightfull.ai", "env_abc");

		expect(result).toEqual(mockConfig);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("returns null after max retries exceeded", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

		const result = await fetchConfig("https://app.insightfull.ai", "env_abc");

		expect(result).toBeNull();
	});

	it("includes clientId in the query string", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ result: { data: mockConfig } }),
		} as Response);

		await fetchConfig("https://app.insightfull.ai", "env_abc");

		const calledUrl = fetchMock.mock.calls[0][0] as string;
		const queryString = calledUrl.split("?")[1];
		const searchParams = new URLSearchParams(queryString);
		const inputStr = searchParams.get("input");
		expect(inputStr).not.toBeNull();
		const input = JSON.parse(inputStr as string);
		expect(input.clientId).toBe("env_abc");
	});
});
