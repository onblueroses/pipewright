/**
 * Example: source monitor.
 *
 * Pipeline (linear): fetch -> rank -> summarize
 *
 * Pulls items from public sources (RSS, YouTube, etc.), ranks them for relevance
 * to a set of topics, and emits a digest. No posting, no accounts.
 *
 * The fetch node is an illustrative stand-in that passes through supplied items;
 * swap it for `rssFetchNode` / `youtubeSearchNode` in production.
 */

import {
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

const ItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	url: z.string(),
});
type Item = z.infer<typeof ItemSchema>;

/** Stand-in for real source fetching (swap for rssFetchNode / youtubeSearchNode). */
const fetchSourcesNode = defineNode({
	type: "fetch-sources",
	name: "Fetch Sources",
	category: "action",
	inputSchema: z.object({ items: z.array(ItemSchema), nextNode: z.string() }),
	outputSchema: z.object({ items: z.array(ItemSchema) }),
	executor: async (input) => ({
		success: true,
		output: { items: input.items },
		nextNode: input.nextNode,
	}),
});

/** Ranks items by keyword overlap with any topic. */
const rankItemsNode = defineNode({
	type: "rank-items",
	name: "Rank Items",
	category: "action",
	inputSchema: z.object({
		items: z.array(ItemSchema),
		topics: z.array(z.string()),
		nextNode: z.string(),
	}),
	outputSchema: z.object({
		ranked: z.array(z.object({ item: ItemSchema, relevance: z.number() })),
	}),
	executor: async (input) => {
		const terms = input.topics.flatMap((t) =>
			t.toLowerCase().split(/\s+/).filter(Boolean),
		);
		const ranked = input.items
			.map((item) => {
				const haystack = item.title.toLowerCase();
				const relevance = terms.reduce(
					(n, t) => (haystack.includes(t) ? n + 1 : n),
					0,
				);
				return { item, relevance };
			})
			.filter((r) => r.relevance > 0)
			.sort((a, b) => b.relevance - a.relevance);
		return { success: true, output: { ranked }, nextNode: input.nextNode };
	},
});

/** Renders a markdown digest from the ranked items. */
const summarizeNode = defineNode({
	type: "summarize",
	name: "Summarize",
	category: "action",
	inputSchema: z.object({
		ranked: z.array(z.object({ item: ItemSchema, relevance: z.number() })),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ digest: z.string(), count: z.number() }),
	executor: async (input) => {
		const lines = input.ranked.map(
			(r) => `- [${r.item.title}](${r.item.url}) (relevance ${r.relevance})`,
		);
		const digest = lines.length
			? `# Digest\n\n${lines.join("\n")}\n`
			: "# Digest\n\n_No relevant items._\n";
		return {
			success: true,
			output: { digest, count: input.ranked.length },
			nextNode: input.nextNode,
		};
	},
});

export interface SourceMonitorConfig {
	/** Items to consider. In production these come from fetch nodes. */
	items: Item[];
	/** Topics to rank relevance against. */
	topics: string[];
}

export function createSourceMonitorRegistry(): NodeRegistry {
	const registry = createRegistry();
	registry.register(fetchSourcesNode);
	registry.register(rankItemsNode);
	registry.register(summarizeNode);
	registry.register(endNode);
	return registry;
}

export function buildSourceMonitorWorkflow(config: SourceMonitorConfig): {
	startNode: string;
	steps: Record<string, WorkflowStep>;
} {
	return {
		startNode: "fetch",
		steps: {
			fetch: {
				nodeType: "fetch-sources",
				input: { items: config.items, nextNode: "rank" },
			},
			rank: {
				nodeType: "rank-items",
				input: {
					items: "{{fetch.items}}",
					topics: config.topics,
					nextNode: "summarize",
				},
			},
			summarize: {
				nodeType: "summarize",
				input: { ranked: "{{rank.ranked}}", nextNode: "done" },
			},
			done: {
				nodeType: "end",
				input: { message: "Digest ready." },
			},
		},
	};
}

export async function runSourceMonitor(
	config: SourceMonitorConfig,
): Promise<WorkflowResult> {
	const registry = createSourceMonitorRegistry();
	const context = createExecutionContext();
	const { steps, startNode } = buildSourceMonitorWorkflow(config);
	return runWorkflow(steps, startNode, registry, context);
}
