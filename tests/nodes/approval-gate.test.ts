import { describe, expect, it, vi } from "vitest";
import { ExecutionContext } from "../../src/core/context.js";
import { NodeRegistry } from "../../src/core/registry.js";
import { createMemoryStore } from "../../src/core/stores.js";
import type { ApprovalNotifier } from "../../src/core/types.js";
import { runWorkflow } from "../../src/core/workflow.js";
import { approvalGateNode } from "../../src/nodes/logic/approval-gate.js";

const registry = new NodeRegistry();
registry.register(approvalGateNode);

describe("approval-gate node", () => {
	it("asks for approval and passes nextNode through", async () => {
		const result = await registry.execute(
			"approval-gate",
			{ message: "Review this draft", nextNode: "publish" },
			new ExecutionContext(),
		);
		expect(result.success).toBe(true);
		expect(result.approvalRequired).toBe(true);
		expect(result.nextNode).toBe("publish");
		expect(result.output).toEqual({ message: "Review this draft" });
	});

	it("notifies the reviewer with the run ID from the store", async () => {
		const notifier: ApprovalNotifier = {
			notify: vi.fn().mockResolvedValue(undefined),
		};
		const result = await runWorkflow(
			{
				review: {
					nodeType: "approval-gate",
					input: {
						message: "Draft text",
						nextNode: "publish",
						metadata: { source: "reddit" },
					},
				},
			},
			"review",
			registry,
			new ExecutionContext({ approvalNotifier: notifier }),
			{ store: createMemoryStore(), id: "wf-001" },
		);
		expect(result.pausedAt).toBe("review");
		expect(notifier.notify).toHaveBeenCalledWith({
			workflowId: "wf-001",
			message: "Draft text",
			metadata: { source: "reddit" },
		});
	});

	it("fails when a notifier is set but the run has no ID", async () => {
		const notifier: ApprovalNotifier = { notify: vi.fn() };
		const result = await registry.execute(
			"approval-gate",
			{ message: "Draft", nextNode: "publish" },
			new ExecutionContext({ approvalNotifier: notifier }),
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("no workflow ID");
		expect(notifier.notify).not.toHaveBeenCalled();
	});

	it("fails the run when the notifier throws", async () => {
		const notifier: ApprovalNotifier = {
			notify: vi.fn().mockRejectedValue(new Error("SMTP down")),
		};
		const result = await runWorkflow(
			{
				review: {
					nodeType: "approval-gate",
					input: { message: "x", nextNode: "y" },
				},
			},
			"review",
			registry,
			new ExecutionContext({ approvalNotifier: notifier }),
			{ store: createMemoryStore() },
		);
		expect(result.success).toBe(false);
		expect(result.pausedAt).toBeUndefined();
		expect(result.error?.code).toBe("NODE_THREW");
		expect(result.error?.message).toContain("SMTP down");
	});
});
