import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createExecutionContext } from "../../src/core/context.js";
import { defineNode } from "../../src/core/node.js";
import { NodeRegistry } from "../../src/core/registry.js";
import type { WorkflowStep } from "../../src/core/types.js";
import { runWorkflow } from "../../src/core/workflow.js";
import { createApprovalApp } from "../../src/infra/approval-server.js";
import { EmailNotifier } from "../../src/infra/email-notifier.js";
import { SqliteWorkflowStore } from "../../src/infra/sqlite-store.js";
import { approvalGateNode } from "../../src/nodes/logic/approval-gate.js";

const published: string[] = [];
const publishNode = defineNode({
	type: "publish",
	name: "Publish",
	category: "action",
	inputSchema: z.object({ text: z.string() }),
	outputSchema: z.object({ published: z.boolean() }),
	executor: async (input) => {
		published.push(input.text);
		return { success: true, output: { published: true } };
	},
});

const steps: Record<string, WorkflowStep> = {
	review: {
		nodeType: "approval-gate",
		input: { message: "Draft post", nextNode: "publish" },
	},
	publish: { nodeType: "publish", input: { text: "{{review.message}}" } },
};

describe("approval flow with SQLite and e-mail", () => {
	let store: SqliteWorkflowStore;
	let registry: NodeRegistry;
	let app: ReturnType<typeof createApprovalApp>;
	const sendMail = vi.fn().mockResolvedValue({ messageId: "m-1" });
	const notifier = new EmailNotifier(
		{
			smtpHost: "smtp.example.com",
			smtpPort: 587,
			smtpUser: "user",
			smtpPass: "pass",
			fromAddress: "from@example.com",
			toAddress: "to@example.com",
			approvalBaseUrl: "http://localhost:3008",
		},
		{ sendMail } as never,
	);

	beforeEach(() => {
		published.length = 0;
		sendMail.mockClear();
		store = new SqliteWorkflowStore(":memory:");
		registry = new NodeRegistry();
		registry.registerAll([approvalGateNode, publishNode]);
		app = createApprovalApp({ store, registry });
	});
	afterEach(() => store.close());

	const pause = () =>
		runWorkflow(
			steps,
			"review",
			registry,
			createExecutionContext({ approvalNotifier: notifier }),
			{ store },
		);

	it("pauses, persists and mails links with the run ID", async () => {
		const paused = await pause();
		expect(paused.pausedAt).toBe("review");
		expect((await store.load(paused.id!))?.status).toBe("paused");

		const mail = sendMail.mock.calls[0][0];
		expect(mail.html).toContain(`http://localhost:3008/approve/${paused.id}`);
		expect(mail.html).toContain(`http://localhost:3008/reject/${paused.id}`);

		const pending = await (await app.request("/pending")).json();
		expect(pending).toEqual([
			expect.objectContaining({ id: paused.id, pausedAt: "review" }),
		]);
	});

	it("GET on an approve link shows a form and changes nothing", async () => {
		const paused = await pause();
		const res = await app.request(`/approve/${paused.id}`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('method="post"');
		expect((await store.load(paused.id!))?.status).toBe("paused");
		expect(published).toEqual([]);
	});

	it("POST approve resumes once, a second approve gets 409", async () => {
		const paused = await pause();
		const first = await app.request(`/approve/${paused.id}`, {
			method: "POST",
		});
		expect(first.status).toBe(200);
		expect((await first.json()).status).toBe("completed");
		expect(published).toEqual(["Draft post"]);

		const second = await app.request(`/approve/${paused.id}`, {
			method: "POST",
		});
		expect(second.status).toBe(409);
		expect(published).toEqual(["Draft post"]);
	});

	it("POST reject marks the run and blocks a later approve", async () => {
		const paused = await pause();
		const res = await app.request(`/reject/${paused.id}`, { method: "POST" });
		expect(await res.json()).toEqual({ status: "rejected" });

		const approve = await app.request(`/approve/${paused.id}`, {
			method: "POST",
		});
		expect(approve.status).toBe(409);
		expect(published).toEqual([]);
	});

	it("returns 404 for an unknown run", async () => {
		expect((await app.request("/approve/missing")).status).toBe(404);
		expect(
			(await app.request("/approve/missing", { method: "POST" })).status,
		).toBe(404);
		expect(
			(await app.request("/reject/missing", { method: "POST" })).status,
		).toBe(404);
	});

	it("escapes HTML in the mailed draft", async () => {
		await notifier.notify({
			workflowId: "wf-1",
			message: "<script>x</script>",
		});
		const html = sendMail.mock.calls[0][0].html as string;
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("SqliteWorkflowStore", () => {
	it("lists by status and transitions atomically", async () => {
		const store = new SqliteWorkflowStore(":memory:");
		const base = {
			result: { success: true, steps: [] },
			contextSnapshot: { nested: { list: [1, 2] } },
			steps: {},
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		await store.save({ ...base, id: "a", status: "paused" });
		await store.save({ ...base, id: "b", status: "completed" });
		expect((await store.list("paused")).map((s) => s.id)).toEqual(["a"]);
		expect((await store.load("a"))?.contextSnapshot).toEqual({
			nested: { list: [1, 2] },
		});

		expect(await store.transition("a", "paused", "running")).toBe(true);
		expect(await store.transition("a", "paused", "running")).toBe(false);
		expect((await store.load("a"))?.status).toBe("running");
		expect(await store.load("missing")).toBeUndefined();
		store.close();
	});
});
