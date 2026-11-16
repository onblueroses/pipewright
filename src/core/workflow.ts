import { randomUUID } from "node:crypto";
import { ExecutionContext } from "./context.js";
import type { NodeRegistry } from "./registry.js";
import type { StepOptions } from "./step.js";
import { runStep } from "./step.js";
import type { WorkflowStatus, WorkflowStore } from "./stores.js";
import type {
	ExecutionContext as Context,
	NodeCredentials,
	NodeServices,
	StepEvent,
	StepRecord,
	WorkflowError,
	WorkflowResult,
	WorkflowStep,
} from "./types.js";

export interface WorkflowOptions extends StepOptions {
	/**
	 * Stop with MAX_STEPS_EXCEEDED after this many steps, resumed steps included.
	 * Default: the number of steps in the workflow, so each step can run once.
	 * A workflow that loops through `nextNode` must set it.
	 */
	maxSteps?: number;
	/** Called after every step, also a failed one. The runner awaits it. */
	onStep?: (event: StepEvent) => void | Promise<void>;
	/** Save the run on start, pause, error and completion. */
	store?: WorkflowStore;
	/** Run ID for the store. Default: a random UUID. */
	id?: string;
}

/** Return the problems that stop a workflow from running. Empty means valid. */
export function validateWorkflow(
	steps: Record<string, WorkflowStep>,
	startNode: string,
	registry: NodeRegistry,
): string[] {
	const errors: string[] = [];
	if (!steps[startNode]) {
		errors.push(`Start step "${startNode}" is not in the workflow`);
	}
	for (const [stepId, step] of Object.entries(steps)) {
		if (!registry.has(step.nodeType)) {
			errors.push(
				`Step "${stepId}": node type "${step.nodeType}" is not registered`,
			);
		}
	}
	return errors;
}

/**
 * Run a workflow one step at a time. Each step names the next step through the
 * `nextNode` of its result. The run stops at the first failure, at an approval
 * gate, or when a step returns no `nextNode`.
 */
export async function runWorkflow(
	steps: Record<string, WorkflowStep>,
	startNode: string,
	registry: NodeRegistry,
	context: Context,
	options: WorkflowOptions = {},
): Promise<WorkflowResult> {
	const run = new Run(steps, context, options, options.id);
	const problems = validateWorkflow(steps, startNode, registry);
	if (problems.length > 0) {
		return run.fail({
			code: "INVALID_WORKFLOW",
			message: `Invalid workflow: ${problems.join("; ")}`,
		});
	}
	await run.start();
	return execute(run, startNode, registry);
}

/**
 * Continue a run that paused at an approval gate. Pass the same context, or one
 * restored with `ExecutionContext.fromJSON` from the paused run's snapshot.
 */
export async function resumeWorkflow(
	paused: WorkflowResult,
	steps: Record<string, WorkflowStep>,
	registry: NodeRegistry,
	context: Context,
	options: WorkflowOptions = {},
): Promise<WorkflowResult> {
	const run = new Run(steps, context, options, options.id ?? paused.id);
	const gate = paused.steps.at(-1);
	if (!paused.success || !paused.pausedAt || gate?.stepId !== paused.pausedAt) {
		return run.fail({
			code: "RESUME_INVALID",
			message: "Cannot resume: the result did not pause at an approval gate",
		});
	}
	run.executed.push(...paused.steps);
	const next = gate.result.nextNode;
	if (next === undefined) return run.finish({ success: true }, "completed");
	await run.start();
	return execute(run, next, registry);
}

export interface ResumeByIdOptions extends WorkflowOptions {
	store: WorkflowStore;
	services?: NodeServices;
	credentials?: NodeCredentials;
}

/**
 * Load a paused run from the store and continue it. The store moves the run
 * from "paused" to "running" in one step, so a second resume of the same run fails.
 */
export async function resumeById(
	id: string,
	registry: NodeRegistry,
	options: ResumeByIdOptions,
): Promise<WorkflowResult> {
	const { store, services, credentials } = options;
	const state = await store.load(id);
	const claimed = state && (await store.transition(id, "paused", "running"));
	if (!state || !claimed) {
		return {
			id,
			success: false,
			steps: state?.result.steps ?? [],
			error: {
				code: "RESUME_INVALID",
				message: state
					? `Cannot resume: workflow "${id}" is not paused`
					: `Cannot resume: no workflow with id "${id}"`,
			},
		};
	}
	const context = ExecutionContext.fromJSON(
		state.contextSnapshot,
		services,
		credentials,
	);
	return resumeWorkflow(state.result, state.steps, registry, context, {
		...options,
		id,
	});
}

async function execute(
	run: Run,
	startNode: string,
	registry: NodeRegistry,
): Promise<WorkflowResult> {
	const { steps, context, options } = run;
	// Without a caller value, the workflow sets the bound: a run without a loop
	// visits each step at most once, so it never needs more steps than it has.
	const maxSteps = options.maxSteps ?? Object.keys(steps).length;
	let current: string | undefined = startNode;

	while (current !== undefined) {
		const step: WorkflowStep | undefined = steps[current];
		if (!step) {
			return run.fail({
				code: "STEP_NOT_FOUND",
				message: `Step "${current}" is not in the workflow`,
				stepId: current,
			});
		}
		if (run.executed.length >= maxSteps) {
			return run.fail({
				code: "MAX_STEPS_EXCEEDED",
				message: `Workflow exceeded ${maxSteps} steps at step "${current}". A workflow that loops must set maxSteps`,
				stepId: current,
			});
		}

		const outcome = await runStep(current, step, registry, context, options);
		run.executed.push(outcome.record);
		if (outcome.record.result.output !== undefined) {
			context.setNodeOutput(current, outcome.record.result.output);
		}
		await options.onStep?.(outcome.event);

		if (!outcome.ok) return run.fail(outcome.error);
		if (outcome.record.result.approvalRequired) {
			return run.finish({ success: true, pausedAt: current }, "paused");
		}
		current = outcome.record.result.nextNode;
	}
	return run.finish({ success: true }, "completed");
}

/** Bookkeeping of one sequential run: the trace, the cost and the store. */
class Run {
	readonly executed: StepRecord[] = [];
	private readonly id?: string;

	constructor(
		readonly steps: Record<string, WorkflowStep>,
		readonly context: Context,
		readonly options: WorkflowOptions,
		id: string | undefined,
	) {
		if (options.store) {
			this.id = id ?? randomUUID();
			// Nodes such as the approval gate read the run ID from here.
			context.set("workflow", { id: this.id });
		}
	}

	async start(): Promise<void> {
		await this.save({ success: true, steps: this.executed }, "running");
	}

	fail(error: WorkflowError): Promise<WorkflowResult> {
		return this.finish({ success: false, error }, "error");
	}

	async finish(
		outcome: Pick<WorkflowResult, "success" | "pausedAt" | "error">,
		status: WorkflowStatus,
	): Promise<WorkflowResult> {
		const result: WorkflowResult = { ...outcome, steps: this.executed };
		if (this.id) result.id = this.id;
		if (this.options.costTracker)
			result.cost = this.options.costTracker.report();
		await this.save(result, status);
		return result;
	}

	private async save(result: WorkflowResult, status: WorkflowStatus) {
		const { store } = this.options;
		if (!store || !this.id) return;
		await store.save({
			id: this.id,
			status,
			result,
			contextSnapshot: this.context.snapshot(),
			steps: this.steps,
			updatedAt: new Date().toISOString(),
		});
	}
}
