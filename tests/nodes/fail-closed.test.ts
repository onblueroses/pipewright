import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import { runWorkflow } from "../../src/core/workflow.js";
import { integrationNodes } from "../../src/nodes/index.js";

// HTTP errors and unreadable model replies must fail the step, never pass as empty data.
describe("integration nodes fail closed", () => {
	const originalFetch = globalThis.fetch;
	const registry = createRegistry();
	registry.registerAll(integrationNodes);

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const respond = (status: number, body: unknown) =>
		vi.mocked(globalThis.fetch).mockImplementation(
			async () =>
				new Response(typeof body === "string" ? body : JSON.stringify(body), {
					status,
					headers: { "content-type": "application/json" },
				}),
		);

	it("youtube-search fails on a 400 instead of returning no videos", async () => {
		respond(400, { error: { message: "API key not valid" } });
		const result = await runWorkflow(
			{
				s: { nodeType: "youtube-search", input: { query: "x", maxResults: 1 } },
			},
			"s",
			registry,
			createExecutionContext({}, {}, { youtube: { apiKey: "bad" } }),
		);
		expect(result.success).toBe(false);
		expect(result.error?.message).toContain("HTTP 400");
		expect(result.error?.message).not.toContain("bad");
	});

	it("http-request fails on a 404 unless allowHttpErrors is set", async () => {
		respond(404, { error: "missing" });
		const failed = await runWorkflow(
			{
				s: {
					nodeType: "http-request",
					input: { url: "https://example.com/x" },
				},
			},
			"s",
			registry,
			createExecutionContext(),
		);
		expect(failed.success).toBe(false);
		expect(failed.error?.code).toBe("NODE_THREW");

		const allowed = await runWorkflow(
			{
				s: {
					nodeType: "http-request",
					input: { url: "https://example.com/x", allowHttpErrors: true },
				},
			},
			"s",
			registry,
			createExecutionContext(),
		);
		expect(allowed.success).toBe(true);
		expect(allowed.steps[0].result.output).toMatchObject({ status: 404 });
	});

	it("social-ai-analyze fails when a batch reply has no JSON", async () => {
		respond(200, {
			content: [{ type: "text", text: "I cannot help with that." }],
			stop_reason: "end_turn",
		});
		const result = await registry.execute(
			"social-ai-analyze",
			{
				topic: "t",
				userIntent: "u",
				posts: [
					{
						id: "1",
						platform: "reddit",
						url: "https://example.com/1",
						text: "hello",
						authorName: "a",
						authorHandle: "a",
						authorUrl: "https://example.com/a",
						postedAt: "2026-01-01T00:00:00Z",
						engagement: { likes: 0, comments: 0, shares: 0 },
					},
				],
			},
			createExecutionContext({}, {}, { anthropic: { apiKey: "k" } }),
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("no JSON array");
	});

	it("social-ai-analyze fails when the model stops at max_tokens", async () => {
		respond(200, {
			content: [{ type: "text", text: "[{" }],
			stop_reason: "max_tokens",
		});
		const result = await registry.execute(
			"social-ai-analyze",
			{
				topic: "t",
				userIntent: "u",
				posts: [
					{
						id: "1",
						platform: "reddit",
						url: "https://example.com/1",
						text: "hello",
						authorName: "a",
						authorHandle: "a",
						authorUrl: "https://example.com/a",
						postedAt: "2026-01-01T00:00:00Z",
						engagement: { likes: 0, comments: 0, shares: 0 },
					},
				],
			},
			createExecutionContext({}, {}, { anthropic: { apiKey: "k" } }),
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("max_tokens");
	});
});
