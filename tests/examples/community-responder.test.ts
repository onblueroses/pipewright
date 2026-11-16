import { describe, expect, it } from "vitest";
import {
	buildCommunityResponderWorkflow,
	runCommunityResponder,
} from "../../examples/community-responder.js";

const config = {
	topic: "release notes",
	voice: "concise and friendly maintainer",
	items: [
		{
			id: "1",
			text: "Anyone know when the release notes drop?",
			url: "https://example.com/1",
		},
		{
			id: "2",
			text: "My cat is asleep on the keyboard",
			url: "https://example.com/2",
		},
	],
};

describe("community-responder example", () => {
	it("pauses at the approval gate (no autopost)", async () => {
		const result = await runCommunityResponder(config);
		expect(result.success).toBe(true);
		expect(result.pausedAt).toBe("review");
	});

	it("drafts a reply for the most relevant item", async () => {
		const result = await runCommunityResponder(config, {
			async generate() {
				return "drafted reply";
			},
		});
		const draftStep = result.steps.find((s) => s.nodeType === "draft-reply");
		expect((draftStep?.result.output as { draft: string }).draft).toBe(
			"drafted reply",
		);
	});

	it("terminates at approval; nothing posts downstream", () => {
		const { steps } = buildCommunityResponderWorkflow(config);
		// The only step reachable after approval is the terminal `end` node.
		expect(steps.review.nodeType).toBe("approval-gate");
		expect(steps.review.input.nextNode).toBe("done");
		expect(steps.done.nodeType).toBe("end");
		// No posting/account/persona/proxy node types exist in this workflow.
		const types = Object.values(steps)
			.map((s) => s.nodeType)
			.join(" ");
		expect(types).not.toMatch(/post|persona|proxy|account|tweet|dm/i);
	});
});
