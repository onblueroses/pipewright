import { describe, expect, it } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { webhookTriggerNode } from "../../src/nodes/logic/webhook-trigger.js";

describe("webhookTriggerNode", () => {
	it("fails when no webhookRequest in context", async () => {
		const ctx = createExecutionContext();
		const result = await webhookTriggerNode.executor(
			{ path: "/hook", method: "POST" },
			ctx,
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/webhookRequest/);
	});

	it("validates method match", async () => {
		const ctx = createExecutionContext(
			{},
			{
				webhookRequest: { method: "GET", headers: {}, body: null },
			},
		);
		const result = await webhookTriggerNode.executor(
			{ path: "/hook", method: "POST" },
			ctx,
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Method mismatch/);
	});

	it("passes through valid request with no auth", async () => {
		const ctx = createExecutionContext(
			{},
			{
				webhookRequest: {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: { event: "push" },
					path: "/hook",
					query: { ref: "main" },
				},
			},
		);
		const result = await webhookTriggerNode.executor(
			{ path: "/hook", method: "POST" },
			ctx,
		);
		expect(result.success).toBe(true);
		expect(result.output?.body).toEqual({ event: "push" });
		expect(result.output?.authenticated).toBe(true);
		expect(result.output?.query).toEqual({ ref: "main" });
	});

	it("rejects invalid basic auth", async () => {
		const ctx = createExecutionContext(
			{},
			{
				webhookRequest: {
					method: "POST",
					headers: {
						authorization: `Basic ${Buffer.from("user:wrong").toString("base64")}`,
					},
					body: null,
				},
			},
		);
		const result = await webhookTriggerNode.executor(
			{
				path: "/hook",
				method: "POST",
				authentication: {
					type: "basic",
					credentials: { username: "user", password: "pass" },
				},
			},
			ctx,
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/authentication failed/);
	});

	it("accepts valid basic auth", async () => {
		const ctx = createExecutionContext(
			{},
			{
				webhookRequest: {
					method: "POST",
					headers: {
						authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
					},
					body: {},
				},
			},
		);
		const result = await webhookTriggerNode.executor(
			{
				path: "/hook",
				method: "POST",
				authentication: {
					type: "basic",
					credentials: { username: "user", password: "pass" },
				},
			},
			ctx,
		);
		expect(result.success).toBe(true);
		expect(result.output?.authenticated).toBe(true);
	});

	it("validates header auth", async () => {
		const ctx = createExecutionContext(
			{},
			{
				webhookRequest: {
					method: "POST",
					headers: { "x-api-key": "secret123" },
					body: null,
				},
			},
		);
		const result = await webhookTriggerNode.executor(
			{
				path: "/hook",
				method: "POST",
				authentication: {
					type: "header",
					credentials: { "x-api-key": "secret123" },
				},
			},
			ctx,
		);
		expect(result.success).toBe(true);
		expect(result.output?.authenticated).toBe(true);
	});
});
