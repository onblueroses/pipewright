/**
 * Example: community responder (human-in-the-loop).
 *
 * Pipeline (linear): monitor_source -> relevance_score -> draft_reply -> approval-gate
 *
 * It watches a source, scores items for relevance to a topic, drafts a reply in a
 * configured voice, then PAUSES at an approval gate. Nothing is ever posted
 * automatically: a human approves (or rejects) each draft before it goes anywhere.
 *
 * The three lead nodes here are illustrative stand-ins so the example runs offline.
 * In production, swap them for real nodes:
 *   - monitor_source  -> `redditMonitorNode` / `rssFetchNode` / `twitterMonitorNode`
 *   - relevance_score -> `socialAiAnalyzeNode` (or an LLM scorer)
 *   - draft_reply     -> `openrouterGenerateNode` with your own prompt
 *
 * Approval gates only work in the linear runner (`runWorkflow`); the DAG runner
 * rejects them. Keep human-approval workflows linear.
 */

import {
	approvalGateNode,
	createExecutionContext,
	createRegistry,
	defineNode,
	endNode,
	type NodeRegistry,
	runWorkflow,
	type WorkflowResult,
	type WorkflowStep,
} from "pipewright";
import { z } from "zod";
import type { LlmService } from "./shared.js";

const ItemSchema = z.object({
	id: z.string(),
	text: z.string(),
	url: z.string(),
});
type Item = z.infer<typeof ItemSchema>;

/** Stand-in for a real source monitor. Passes through supplied items. */
const monitorSourceNode = defineNode({
	type: "monitor-source",
	name: "Monitor Source",
	category: "action",
	inputSchema: z.object({
		items: z.array(ItemSchema),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ items: z.array(ItemSchema) }),
	executor: async (input) => ({
		success: true,
		output: { items: input.items },
		nextNode: input.nextNode,
	}),
});

/** Scores items by keyword overlap with the topic and picks the top one. */
const relevanceScoreNode = defineNode({
	type: "relevance-score",
	name: "Relevance Score",
	category: "action",
	inputSchema: z.object({
		items: z.array(ItemSchema),
		topic: z.string(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({
		top: ItemSchema.nullable(),
		topScore: z.number(),
	}),
	executor: async (input) => {
		const terms = input.topic.toLowerCase().split(/\s+/).filter(Boolean);
		const ranked = input.items
			.map((item) => {
				const haystack = item.text.toLowerCase();
				const score = terms.reduce(
					(n, t) => (haystack.includes(t) ? n + 1 : n),
					0,
				);
				return { item, score };
			})
			.sort((a, b) => b.score - a.score);
		const best = ranked[0];
		return {
			success: true,
			output: { top: best?.item ?? null, topScore: best?.score ?? 0 },
			nextNode: input.nextNode,
		};
	},
});

/** Drafts a reply in the configured voice. Uses the `llm` service if injected. */
const draftReplyNode = defineNode({
	type: "draft-reply",
	name: "Draft Reply",
	category: "action",
	inputSchema: z.object({
		item: ItemSchema.nullable(),
		voice: z.string(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ draft: z.string() }),
	executor: async (input, context) => {
		if (!input.item) {
			return {
				success: true,
				output: { draft: "" },
				nextNode: input.nextNode,
			};
		}
		const prompt = `Write a helpful, honest reply in this voice: "${input.voice}".\n\nThey wrote:\n${input.item.text}\n\nReply:`;
		const llm = context.services.llm;
		const draft = llm
			? await llm.generate(prompt)
			: `[${input.voice}] Thanks for raising this — here is a considered reply to: "${input.item.text.slice(0, 60)}…"`;
		return {
			success: true,
			output: { draft },
			nextNode: input.nextNode,
		};
	},
});

export interface CommunityResponderConfig {
	/** Items to consider. In production these come from a monitor node. */
	items: Item[];
	/** Topic to score relevance against. */
	topic: string;
	/** A single voice/tone the drafter writes in. */
	voice: string;
}

/** Registers the nodes this example needs. */
export function createCommunityResponderRegistry(): NodeRegistry {
	const registry = createRegistry();
	registry.register(monitorSourceNode);
	registry.register(relevanceScoreNode);
	registry.register(draftReplyNode);
	registry.register(approvalGateNode);
	registry.register(endNode);
	return registry;
}

/** Builds the linear workflow. Terminates at the approval gate (then `end`). */
export function buildCommunityResponderWorkflow(
	config: CommunityResponderConfig,
): {
	startNode: string;
	steps: Record<string, WorkflowStep>;
} {
	return {
		startNode: "monitor",
		steps: {
			monitor: {
				nodeType: "monitor-source",
				input: { items: config.items, nextNode: "score" },
			},
			score: {
				nodeType: "relevance-score",
				input: {
					items: "{{monitor.items}}",
					topic: config.topic,
					nextNode: "compose",
				},
			},
			compose: {
				nodeType: "draft-reply",
				input: {
					item: "{{score.top}}",
					voice: config.voice,
					nextNode: "review",
				},
			},
			review: {
				nodeType: "approval-gate",
				input: {
					message: "{{compose.draft}}",
					nextNode: "done",
					metadata: { source: "community-responder", topic: config.topic },
				},
			},
			done: {
				nodeType: "end",
				input: {
					message: "Awaiting human approval. No reply is sent automatically.",
				},
			},
		},
	};
}

/** Runs the workflow. Returns a result paused at the approval gate. */
export async function runCommunityResponder(
	config: CommunityResponderConfig,
	llm?: LlmService,
): Promise<WorkflowResult> {
	const registry = createCommunityResponderRegistry();
	const context = createExecutionContext(llm ? { llm } : {});
	const { steps, startNode } = buildCommunityResponderWorkflow(config);
	return runWorkflow(steps, startNode, registry, context);
}
