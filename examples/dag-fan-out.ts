/**
 * DAG fan-out: fetch two sources at the same time, then merge and sort them.
 *
 *   news ─┐
 *         ├─> merge ─> rank
 *   blog ─┘
 *
 * `news` and `blog` run in one wave. The fetch node is a stand-in. Swap it for
 * `rssFetchNode` from "pipewright/nodes" in production.
 *
 * Run: npx tsx examples/dag-fan-out.ts
 */
import {
	builtInNodes,
	createExecutionContext,
	createRegistry,
	type DAGDefinition,
	defineNode,
	runDAGWorkflow,
	type WorkflowResult,
} from "pipewright";
import { z } from "zod";

const Item = z.object({ title: z.string(), score: z.number() });

const fetchSourceNode = defineNode({
	type: "fetch-source",
	name: "Fetch Source",
	category: "action",
	inputSchema: z.object({ source: z.string(), items: z.array(Item) }),
	outputSchema: z.object({ items: z.array(Item) }),
	executor: async (input) => {
		await new Promise((r) => setTimeout(r, 20));
		return { success: true, output: { items: input.items } };
	},
});

const mergeNode = defineNode({
	type: "merge-lists",
	name: "Merge Lists",
	category: "transform",
	inputSchema: z.object({ lists: z.array(z.array(Item)) }),
	outputSchema: z.object({ items: z.array(Item) }),
	executor: async (input) => ({
		success: true,
		output: { items: input.lists.flat() },
	}),
});

export const fanOutDAG: DAGDefinition = {
	nodes: [
		{
			id: "news",
			nodeType: "fetch-source",
			input: { source: "news", items: [{ title: "Release notes", score: 3 }] },
		},
		{
			id: "blog",
			nodeType: "fetch-source",
			input: { source: "blog", items: [{ title: "Design notes", score: 7 }] },
		},
		{
			id: "merge",
			nodeType: "merge-lists",
			input: { lists: ["{{news.items}}", "{{blog.items}}"] },
		},
		{
			id: "rank",
			nodeType: "sort",
			input: { items: "{{merge.items}}", path: "score", direction: "desc" },
		},
	],
	edges: [
		{ from: "news", to: "merge" },
		{ from: "blog", to: "merge" },
		{ from: "merge", to: "rank" },
	],
};

export async function runFanOut(): Promise<WorkflowResult> {
	const registry = createRegistry();
	registry.registerAll(builtInNodes);
	registry.registerAll([fetchSourceNode, mergeNode]);
	return runDAGWorkflow(fanOutDAG, registry, createExecutionContext());
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const result = await runFanOut();
	if (!result.success) throw new Error(result.error?.message);
	console.log(result.steps.at(-1)?.result.output);
}
