import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchRetryError, fetchWithRetry } from "../../src/utils/http.js";

describe("fetchWithRetry", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns response on success", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("ok", { status: 200 }));
		const res = await fetchWithRetry(
			"https://example.com",
			{},
			{ maxRetries: 1 },
		);
		expect(res.status).toBe(200);
	});

	it("throws FetchRetryError on 401", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response("unauthorized", {
				status: 401,
				statusText: "Unauthorized",
			}),
		);
		await expect(
			fetchWithRetry("https://example.com", {}, { maxRetries: 1 }),
		).rejects.toThrow(FetchRetryError);
	});

	it("makes one attempt by default", async () => {
		const mockFetch = vi
			.fn()
			.mockImplementation(async () => new Response("down", { status: 503 }));
		globalThis.fetch = mockFetch;
		await expect(fetchWithRetry("https://example.com")).rejects.toThrow(
			FetchRetryError,
		);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("retries on 500 and eventually throws", async () => {
		const mockFetch = vi.fn().mockImplementation(
			async () =>
				new Response("server error", {
					status: 500,
					statusText: "Internal Server Error",
				}),
		);
		globalThis.fetch = mockFetch;

		await expect(
			fetchWithRetry(
				"https://example.com",
				{},
				{ maxRetries: 2, backoffMs: 1 },
			),
		).rejects.toThrow(FetchRetryError);

		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	it("throws on 4xx without retry, and keeps the query string out of the message", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response("not found", { status: 404 }));
		globalThis.fetch = mockFetch;

		const error = await fetchWithRetry(
			"https://example.com/items?key=secret",
			{},
			{ maxRetries: 3 },
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(FetchRetryError);
		expect((error as FetchRetryError).status).toBe(404);
		expect((error as Error).message).toContain("https://example.com/items");
		expect((error as Error).message).not.toContain("secret");
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("returns 4xx responses when allowHttpErrors is set", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("not found", { status: 404 }));
		const res = await fetchWithRetry(
			"https://example.com",
			{},
			{ allowHttpErrors: true },
		);
		expect(res.status).toBe(404);
	});
});
