import type { NodeExecutionConfig } from "./config.js";
import { resolveNodeConfig } from "./config.js";
import type { CostTracker } from "./cost.js";
import { BudgetExceededError } from "./cost.js";
import type { NodeRegistry } from "./registry.js";
import { NodeValidationError } from "./registry.js";
import type { CacheStore } from "./stores.js";
import type {
	ExecutionContext,
	NodeResult,
	StepEvent,
	StepRecord,
	WorkflowError,
	WorkflowStep,
} from "./types.js";

/** Options that both runners pass to every step. */
export interface StepOptions {
	costTracker?: CostTracker;
	cacheStore?: CacheStore;
	/** Execution settings by node type or step ID. */
	nodeConfig?: Record<string, Partial<NodeExecutionConfig>>;
}

/**
 * The result of one step. A failed step has an error. It also has a record
 * when the node ran, so the trace always shows the step that failed.
 */
export type StepOutcome =
	| { ok: true; record: StepRecord; event: StepEvent }
	| { ok: false; record: StepRecord; event: StepEvent; error: WorkflowError };

export class NodeTimeoutError extends Error {
	constructor(nodeType: string, timeoutMs: number) {
		super(`Node "${nodeType}" timed out after ${timeoutMs}ms`);
		this.name = "NodeTimeoutError";
	}
}

/**
 * Run one step: interpolate the input, use the cache, apply retries and the
 * timeout, and validate through the registry. It never throws. Every error
 * becomes a failed outcome.
 */
export async function runStep(
	stepId: string,
	step: WorkflowStep,
	registry: NodeRegistry,
	context: ExecutionContext,
	options: StepOptions = {},
): Promise<StepOutcome> {
	const { nodeType } = step;
	const started = Date.now();
	const config = resolveNodeConfig(nodeType, stepId, options.nodeConfig);
	const input = context.interpolateObject(step.input);
	const cache = config.cacheTtlMs ? options.cacheStore : undefined;
	const cacheKey =
		config.cacheKey ??
		`node:${nodeType}:${stepId}:${hash(JSON.stringify(input))}`;

	const outcome = (
		result: NodeResult,
		cached: boolean,
		error?: WorkflowError,
	): StepOutcome => {
		const record = { stepId, nodeType, result };
		const event: StepEvent = {
			stepId,
			nodeType,
			result,
			durationMs: Date.now() - started,
			cached,
			cost: options.costTracker?.stepReport(stepId),
		};
		return error
			? { ok: false, record, event, error }
			: { ok: true, record, event };
	};

	if (cache) {
		const hit = (await cache.get(cacheKey)) as NodeResult | undefined;
		if (hit !== undefined) return outcome(hit, true);
	}

	let result: NodeResult;
	try {
		const run = () =>
			executeWithConfig(registry, nodeType, input, context, config);
		result = options.costTracker
			? await options.costTracker.runInStep(stepId, run)
			: await run();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const code =
			err instanceof BudgetExceededError
				? "BUDGET_EXCEEDED"
				: err instanceof NodeValidationError
					? "VALIDATION_ERROR"
					: "NODE_THREW";
		const text =
			code === "NODE_THREW"
				? `Node "${nodeType}" (step "${stepId}") threw: ${message}`
				: message;
		return outcome({ success: false, error: text }, false, {
			code,
			message: text,
			stepId,
			nodeType,
		});
	}

	if (!result.success) {
		const message =
			result.error ?? `Node "${nodeType}" (step "${stepId}") failed`;
		return outcome(result, false, {
			code: "NODE_FAILED",
			message,
			stepId,
			nodeType,
		});
	}

	if (cache) await cache.set(cacheKey, result, config.cacheTtlMs);
	return outcome(result, false);
}

async function executeWithConfig(
	registry: NodeRegistry,
	nodeType: string,
	input: unknown,
	context: ExecutionContext,
	config: NodeExecutionConfig,
): Promise<NodeResult> {
	const attempts = Math.max(1, config.retryCount + 1);
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			const run = registry.execute(nodeType, input, context);
			return config.timeoutMs
				? await withTimeout(run, config.timeoutMs, nodeType)
				: await run;
		} catch (err) {
			// A timed-out attempt can still be running, and a budget stop is final.
			if (
				err instanceof NodeTimeoutError ||
				err instanceof BudgetExceededError
			) {
				throw err;
			}
			lastError = err;
			if (attempt < attempts - 1 && config.retryDelayMs) {
				const delay = config.retryDelayMs * 2 ** attempt;
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}
	throw lastError;
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	nodeType: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new NodeTimeoutError(nodeType, timeoutMs)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function hash(text: string): string {
	let h = 0;
	for (let i = 0; i < text.length; i++) {
		h = ((h << 5) - h + text.charCodeAt(i)) | 0;
	}
	return (h >>> 0).toString(36);
}
