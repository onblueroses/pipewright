import { z } from "zod";
import { defineNode } from "../../core/node.js";

/**
 * Pause the sequential runner. With an `approvalNotifier` service, tell a
 * reviewer first. The notifier needs the run ID, so it needs a store.
 */
export const approvalGateNode = defineNode({
	type: "approval-gate",
	name: "Approval Gate",
	description: "Pause the workflow until a person approves it",
	category: "logic",
	inputSchema: z.object({
		message: z.string().describe("Text or summary for the reviewer"),
		nextNode: z.string().describe("Step to run after approval"),
		metadata: z.record(z.string(), z.unknown()).optional(),
	}),
	outputSchema: z.object({
		message: z.string(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	}),
	executor: async (input, context) => {
		const notifier = context.services.approvalNotifier;
		if (notifier) {
			const workflowId = context.get("workflow.id");
			if (typeof workflowId !== "string") {
				return {
					success: false,
					error:
						"approval-gate has an approvalNotifier but no workflow ID. Pass a store to runWorkflow.",
				};
			}
			await notifier.notify({
				workflowId,
				message: input.message,
				metadata: input.metadata,
			});
		}
		return {
			success: true,
			output: { message: input.message, metadata: input.metadata },
			approvalRequired: true,
			nextNode: input.nextNode,
		};
	},
});
