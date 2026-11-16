import type { NodeRegistry } from "./registry.js";
import type { StepOptions } from "./step.js";
import { runStep } from "./step.js";
import type {
	ExecutionContext,
	StepEvent,
	StepRecord,
	WorkflowError,
	WorkflowResult,
} from "./types.js";

export interface DAGNode {
	id: string;
	nodeType: string;
	input: Record<string, unknown>;
}

/** `to` runs after `from` and can read its output. */
export interface DAGEdge {
	from: string;
	to: string;
}

export interface DAGDefinition {
	nodes: DAGNode[];
	edges: DAGEdge[];
}

export interface DAGOptions extends StepOptions {
	/** Called after every node, in wave order. The runner awaits it. */
	onStep?: (event: StepEvent) => void | Promise<void>;
}

/**
 * Check IDs, edge endpoints, self-edges and cycles. With a registry, also check
 * that every node type is registered. Empty means valid.
 */
export function validateDAG(
	dag: DAGDefinition,
	registry?: NodeRegistry,
): string[] {
	const errors: string[] = [];
	const ids = new Set<string>();
	for (const node of dag.nodes) {
		if (ids.has(node.id)) errors.push(`Duplicate node ID "${node.id}"`);
		ids.add(node.id);
		if (registry && !registry.has(node.nodeType)) {
			errors.push(
				`Node "${node.id}": node type "${node.nodeType}" is not registered`,
			);
		}
	}
	for (const { from, to } of dag.edges) {
		if (from === to) errors.push(`Self-edge on node "${from}"`);
		if (!ids.has(from)) errors.push(`Edge references missing node "${from}"`);
		if (!ids.has(to)) errors.push(`Edge references missing node "${to}"`);
	}
	if (errors.length === 0) {
		try {
			topologicalSort(dag);
		} catch (err) {
			errors.push((err as Error).message);
		}
	}
	return errors;
}

/**
 * Kahn's algorithm. Returns waves: every node in a wave depends only on nodes in
 * earlier waves. Throws on a cycle.
 */
export function topologicalSort(dag: DAGDefinition): string[][] {
	const inDegree = new Map(dag.nodes.map((n) => [n.id, 0]));
	const next = new Map<string, string[]>(dag.nodes.map((n) => [n.id, []]));
	for (const { from, to } of dag.edges) {
		next.get(from)?.push(to);
		inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
	}

	const waves: string[][] = [];
	let wave = [...inDegree].filter(([, d]) => d === 0).map(([id]) => id);
	let seen = 0;
	while (wave.length > 0) {
		waves.push(wave);
		seen += wave.length;
		const following: string[] = [];
		for (const id of wave) {
			for (const to of next.get(id) ?? []) {
				const degree = (inDegree.get(to) ?? 1) - 1;
				inDegree.set(to, degree);
				if (degree === 0) following.push(to);
			}
		}
		wave = following;
	}

	if (seen < dag.nodes.length) {
		const stuck = dag.nodes.filter((n) => (inDegree.get(n.id) ?? 0) > 0);
		throw new Error(
			`Cycle detected involving nodes: ${stuck.map((n) => n.id).join(", ")}`,
		);
	}
	return waves;
}

/**
 * Run a DAG in waves. The nodes of one wave run at the same time. Later waves
 * read earlier outputs through `{{nodeId.field}}`. The edges set the order, so a
 * node that returns `nextNode` or asks for approval fails the run.
 */
export async function runDAGWorkflow(
	dag: DAGDefinition,
	registry: NodeRegistry,
	context: ExecutionContext,
	options: DAGOptions = {},
): Promise<WorkflowResult> {
	const executed: StepRecord[] = [];
	const finish = (error?: WorkflowError): WorkflowResult => {
		const result: WorkflowResult = { success: !error, steps: executed };
		if (error) result.error = error;
		if (options.costTracker) result.cost = options.costTracker.report();
		return result;
	};

	const problems = validateDAG(dag, registry);
	if (problems.length > 0) {
		return finish({
			code: "INVALID_WORKFLOW",
			message: `Invalid DAG: ${problems.join("; ")}`,
		});
	}

	const nodes = new Map(dag.nodes.map((n) => [n.id, n]));
	for (const wave of topologicalSort(dag)) {
		const outcomes = await Promise.all(
			wave.map((id) => {
				const node = nodes.get(id) as DAGNode;
				return runStep(id, node, registry, context, options);
			}),
		);

		let firstError: WorkflowError | undefined;
		for (const outcome of outcomes) {
			const { stepId, nodeType, result } = outcome.record;
			executed.push(outcome.record);
			if (result.output !== undefined)
				context.setNodeOutput(stepId, result.output);
			await options.onStep?.(outcome.event);

			if (firstError) continue;
			if (!outcome.ok) {
				firstError = outcome.error;
			} else if (result.approvalRequired || result.nextNode !== undefined) {
				firstError = {
					code: "INVALID_WORKFLOW",
					message: `Node "${stepId}" ${
						result.approvalRequired ? "asked for approval" : "returned nextNode"
					}. In a DAG the edges set the order. Use runWorkflow for gates and branches.`,
					stepId,
					nodeType,
				};
			}
		}
		if (firstError) return finish(firstError);
	}
	return finish();
}
