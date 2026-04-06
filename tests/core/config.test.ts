import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resolveNodeConfig } from "../../src/core/config.js";
import { createExecutionContext } from "../../src/core/context.js";
import { defineNode } from "../../src/core/node.js";
import { createRegistry } from "../../src/core/registry.js";
import { createMemoryCacheStore } from "../../src/core/stores.js";
import { runWorkflow } from "../../src/core/workflow.js";

describe("resolveNodeConfig", () => {
	it("returns defaults when no overrides", () => {
		const config = resolveNodeConfig("myType", "step1");
		expect(config.retryCount).toBe(0);
		expect(config.timeoutMs).toBe(30000);
	});

	it("applies nodeType override", () => {
		const config = resolveNodeConfig("myType", "step1", {
			myType: { timeoutMs: 5000 },
		});
		expect(config.timeoutMs).toBe(5000);
		expect(config.retryCount).toBe(0);
	});

	it("stepId override beats nodeType override", () => {
		const config = resolveNodeConfig("myType", "step1", {
			myType: { timeoutMs: 5000 },
			step1: { timeoutMs: 100 },
		});
		expect(config.timeoutMs).toBe(100);
	});

	it("merges across sources", () => {
		const config = resolveNodeConfig("myType", "step1", {
			myType: { retryCount: 3 },
			step1: { timeoutMs: 100 },
		});
		expect(config.retryCount).toBe(3);
		expect(config.timeoutMs).toBe(100);
	});
});

describe("nodeConfig in workflow", () => {
	let callCount = 0;
	const failOnceNode = defineNode({
		type: "fail-once",
		name: "Fail Once",
		category: "action",
		inputSchema: z.object({}),
		outputSchema: z.object({ ok: z.boolean() }),
		executor: async () => {
			callCount++;
			if (callCount === 1) throw new Error("First call fails");
			return { success: true, output: { ok: true } };
		},
	});

	const slowNode = defineNode({
		type: "slow",
		name: "Slow",
		category: "action",
		inputSchema: z.object({}),
		outputSchema: z.object({ done: z.boolean() }),
		executor: async () => {
			await new Promise((r) => setTimeout(r, 500));
			return { success: true, output: { done: true } };
		},
	});

	it("retries a failing node", async () => {
		callCount = 0;
		const registry = createRegistry();
		registry.register(failOnceNode);
		const ctx = createExecutionContext();

		const result = await runWorkflow(
			{ step1: { nodeType: "fail-once", input: {} } },
			"step1",
			registry,
			ctx,
			{ nodeConfig: { "fail-once": { retryCount: 2 } } },
		);

		expect(result.success).toBe(true);
		expect(callCount).toBe(2);
	});

	it("times out a slow node", async () => {
		const registry = createRegistry();
		registry.register(slowNode);
		const ctx = createExecutionContext();

		const result = await runWorkflow(
			{ step1: { nodeType: "slow", input: {} } },
			"step1",
			registry,
			ctx,
			{ nodeConfig: { step1: { timeoutMs: 50 } } },
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("timed out");
	});

	it("caches node results", async () => {
		const registry = createRegistry();
		const executorSpy = vi.fn(async (input: { value: string }) => ({
			success: true as const,
			output: { value: input.value },
		}));

		const spyNode = defineNode({
			type: "spy",
			name: "Spy",
			category: "action",
			inputSchema: z.object({ value: z.string() }),
			outputSchema: z.object({ value: z.string() }),
			executor: executorSpy,
		});
		registry.register(spyNode);

		const cacheStore = createMemoryCacheStore();

		const ctx1 = createExecutionContext();
		await runWorkflow(
			{ step1: { nodeType: "spy", input: { value: "hello" } } },
			"step1",
			registry,
			ctx1,
			{ cacheStore, nodeConfig: { spy: { cacheTtlMs: 60000 } } },
		);
		expect(executorSpy).toHaveBeenCalledTimes(1);

		const ctx2 = createExecutionContext();
		const result2 = await runWorkflow(
			{ step1: { nodeType: "spy", input: { value: "hello" } } },
			"step1",
			registry,
			ctx2,
			{ cacheStore, nodeConfig: { spy: { cacheTtlMs: 60000 } } },
		);
		expect(executorSpy).toHaveBeenCalledTimes(1);
		expect(result2.success).toBe(true);
	});
});
