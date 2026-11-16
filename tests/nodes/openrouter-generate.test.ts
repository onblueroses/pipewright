import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import { openrouterGenerateNode } from "../../src/nodes/integrations/openrouter/index.js";

describe("openrouter_generate node", () => {
	const originalFetch = globalThis.fetch;
	let registry: ReturnType<typeof createRegistry>;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
		registry = createRegistry();
		registry.register(openrouterGenerateNode);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockOpenRouterResponse(
		text: string,
		model = "deepseek/deepseek-chat",
	) {
		return {
			status: 200,
			ok: true,
			headers: new Headers({ "content-type": "application/json" }),
			json: async () => ({
				choices: [{ message: { content: text }, finish_reason: "stop" }],
				usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
				model,
			}),
			text: async () =>
				JSON.stringify({ choices: [{ message: { content: text } }] }),
		} as unknown as Response;
	}

	it("generates text with system and user prompts", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockOpenRouterResponse("Hello, I am an assistant."),
		);

		const ctx = createExecutionContext(
			{},
			{},
			{ openRouter: { apiKey: "sk-or-test" } },
		);

		const result = await registry.execute(
			"openrouter-generate",
			{
				prompt: "Say hello",
				systemPrompt: "You are a helpful assistant.",
				model: "deepseek/deepseek-chat",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.text).toBe("Hello, I am an assistant.");
		expect(result.output?.usage).toEqual({
			promptTokens: 10,
			completionTokens: 20,
			totalTokens: 30,
		});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const reqBody = JSON.parse(fetchCall[1]?.body as string);
		expect(reqBody.messages).toHaveLength(2);
		expect(reqBody.messages[0].role).toBe("system");
		expect(reqBody.messages[1].role).toBe("user");
	});

	it("enables JSON mode when requested", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockOpenRouterResponse('{"key": "value"}'),
		);

		const ctx = createExecutionContext(
			{},
			{},
			{ openRouter: { apiKey: "sk-or-test" } },
		);

		await registry.execute(
			"openrouter-generate",
			{
				prompt: "return json",
				model: "deepseek/deepseek-chat",
				jsonMode: true,
			},
			ctx,
		);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const reqBody = JSON.parse(fetchCall[1]?.body as string);
		expect(reqBody.response_format).toEqual({ type: "json_object" });
	});

	it("handles API error responses", async () => {
		// fetchWithRetry throws on 429 after retries, so the node catches it
		vi.mocked(globalThis.fetch).mockResolvedValue({
			status: 400,
			ok: false,
			headers: new Headers(),
			text: async () => "Bad request: invalid model",
			json: async () => ({ error: "bad request" }),
		} as unknown as Response);

		const ctx = createExecutionContext(
			{},
			{},
			{ openRouter: { apiKey: "sk-or-test" } },
		);

		const result = await registry.execute(
			"openrouter-generate",
			{
				prompt: "test",
				model: "invalid-model",
			},
			ctx,
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("400");
	});

	it("returns error when no credentials provided", async () => {
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"openrouter-generate",
			{
				prompt: "test",
				model: "deepseek/deepseek-chat",
			},
			ctx,
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Missing OpenRouter API key");
	});

	it("passes maxTokens and temperature", async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue(
			mockOpenRouterResponse("short"),
		);

		const ctx = createExecutionContext(
			{},
			{},
			{ openRouter: { apiKey: "sk-or-test" } },
		);

		await registry.execute(
			"openrouter-generate",
			{
				prompt: "test",
				model: "deepseek/deepseek-chat",
				maxTokens: 100,
				temperature: 0.7,
			},
			ctx,
		);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const reqBody = JSON.parse(fetchCall[1]?.body as string);
		expect(reqBody.max_tokens).toBe(100);
		expect(reqBody.temperature).toBe(0.7);
	});
});
