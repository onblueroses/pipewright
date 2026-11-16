import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import { httpRequestNode } from "../../src/nodes/integrations/http/index.js";

describe("http_request node", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("performs a GET request", async () => {
		const mockResponse = {
			status: 200,
			headers: new Headers({ "content-type": "application/json" }),
			json: async () => ({ data: "hello" }),
			text: async () => '{"data":"hello"}',
			ok: true,
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockResponse as unknown as Response,
		);

		const registry = createRegistry();
		registry.register(httpRequestNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"http-request",
			{
				url: "https://api.example.com/data",
				method: "GET",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output).toEqual({
			status: 200,
			body: { data: "hello" },
			headers: expect.objectContaining({ "content-type": "application/json" }),
		});
	});

	it("performs a POST request with body", async () => {
		const mockResponse = {
			status: 201,
			headers: new Headers({ "content-type": "application/json" }),
			json: async () => ({ id: 1 }),
			text: async () => '{"id":1}',
			ok: true,
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockResponse as unknown as Response,
		);

		const registry = createRegistry();
		registry.register(httpRequestNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"http-request",
			{
				url: "https://api.example.com/data",
				method: "POST",
				body: { name: "test" },
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.status).toBe(201);
		expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
			"https://api.example.com/data",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ name: "test" }),
			}),
		);
	});

	it("returns text body for non-JSON responses", async () => {
		const mockResponse = {
			status: 200,
			headers: new Headers({ "content-type": "text/html" }),
			json: async () => {
				throw new Error("not json");
			},
			text: async () => "<html>hello</html>",
			ok: true,
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockResponse as unknown as Response,
		);

		const registry = createRegistry();
		registry.register(httpRequestNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"http-request",
			{
				url: "https://example.com",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.body).toBe("<html>hello</html>");
	});

	it("forwards custom headers", async () => {
		const mockResponse = {
			status: 200,
			headers: new Headers(),
			json: async () => ({}),
			text: async () => "{}",
			ok: true,
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockResponse as unknown as Response,
		);

		const registry = createRegistry();
		registry.register(httpRequestNode);
		const ctx = createExecutionContext();

		await registry.execute(
			"http-request",
			{
				url: "https://api.example.com/data",
				headers: { Authorization: "Bearer token123" },
			},
			ctx,
		);

		expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
			"https://api.example.com/data",
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: "Bearer token123" }),
			}),
		);
	});
});
