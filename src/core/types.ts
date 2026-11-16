import type { ZodType } from "zod";
import type { CostReport, StepCostReport } from "./cost.js";

export type NodeCategory = "action" | "logic" | "integration" | "transform";

/**
 * A unit of work. The registry parses the input with `inputSchema` before the
 * executor runs, and parses the output of a successful result with `outputSchema`.
 */
export interface NodeDefinition<TInput = unknown, TOutput = unknown> {
	type: string;
	name: string;
	description?: string;
	category: NodeCategory;
	// The input type is `any` so that schemas with `.default()` (where the parsed
	// type differs from the accepted type) still fit.
	inputSchema: ZodType<TInput, any>;
	outputSchema: ZodType<TOutput, any>;
	executor: NodeExecutor<TInput, TOutput>;
}

/** Any node definition, whatever its input and output types. */
export type AnyNodeDefinition = NodeDefinition<any, any>;

export interface NodeResult<TOutput = unknown> {
	success: boolean;
	output?: TOutput;
	error?: string;
	/** Step ID to run next. Only the sequential runner follows it. */
	nextNode?: string;
	/** Pause the sequential runner after this step. */
	approvalRequired?: boolean;
}

export type NodeExecutor<TInput, TOutput> = (
	input: TInput,
	context: ExecutionContext,
) => Promise<NodeResult<TOutput>>;

/** Services that nodes receive through the context. Extend it with module augmentation. */
export interface NodeServices {
	/** Used by `approval-gate` to tell a reviewer that a run waits. */
	approvalNotifier?: ApprovalNotifier;
	/** Used by `test-gate` to run a command. */
	exec?: ExecService;
	[key: string]: unknown;
}

export interface ApprovalNotifier {
	notify(request: {
		workflowId: string;
		message: string;
		metadata?: Record<string, unknown>;
	}): Promise<void>;
}

export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface ExecOptions {
	timeout?: number;
}

export type ExecService = (
	command: string,
	options?: ExecOptions,
) => Promise<ExecResult>;

/** API credentials of the built-in integration nodes. Nodes never read the environment. */
export interface KnownCredentials {
	anthropic?: { apiKey: string };
	apify?: { apiToken: string };
	dataForSeo?: { apiToken: string };
	devto?: { apiKey: string };
	discordBot?: { botToken: string };
	discordWebhook?: { webhookUrl: string };
	elevenlabs?: { apiKey: string };
	firecrawl?: { bearerToken?: string };
	googleSheets?: {
		clientId: string;
		clientSecret: string;
		accessToken: string;
		refreshToken: string;
		expiresAt: number;
	};
	openai?: { apiKey: string };
	openRouter?: { apiKey: string };
	ssh?: { privateKey: string; host: string; user: string; port?: number };
	tavily?: { apiKey: string };
	twitter?: {
		clientId?: string;
		clientSecret?: string;
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		bearerToken?: string;
		twitterApiIoKey?: string;
		consumerKey?: string;
		consumerSecret?: string;
		accessTokenSecret?: string;
	};
	unsplash?: { accessKey: string };
	wordpress?: {
		siteUrl: string;
		username: string;
		applicationPassword: string;
	};
	youtube?: { apiKey: string };
}

export type NodeCredentials = KnownCredentials &
	Record<string, Record<string, unknown> | undefined>;

/** Node metadata without executor and schemas. Safe to send to a frontend. */
export type NodeMetadata = Omit<
	NodeDefinition,
	"executor" | "inputSchema" | "outputSchema"
>;

export interface ExecutionContext {
	readonly services: NodeServices;
	readonly credentials?: NodeCredentials;
	setNodeOutput(stepId: string, output: unknown): void;
	get(path: string): unknown;
	set(key: string, value: unknown): void;
	interpolate(template: string): unknown;
	interpolateObject<T extends Record<string, unknown>>(obj: T): T;
	snapshot(): Record<string, unknown>;
}

/** One step of a sequential workflow. The key in the workflow map is the step ID. */
export interface WorkflowStep {
	nodeType: string;
	input: Record<string, unknown>;
}

export type WorkflowErrorCode =
	| "INVALID_WORKFLOW"
	| "STEP_NOT_FOUND"
	| "VALIDATION_ERROR"
	| "NODE_FAILED"
	| "NODE_THREW"
	| "BUDGET_EXCEEDED"
	| "MAX_STEPS_EXCEEDED"
	| "RESUME_INVALID";

export interface WorkflowError {
	code: WorkflowErrorCode;
	message: string;
	stepId?: string;
	nodeType?: string;
}

export interface StepRecord {
	stepId: string;
	nodeType: string;
	result: NodeResult;
}

export interface WorkflowResult {
	/** Set when the run is persisted to a store. */
	id?: string;
	success: boolean;
	steps: StepRecord[];
	/** Step ID of the approval gate that paused the run. */
	pausedAt?: string;
	error?: WorkflowError;
	cost?: CostReport;
}

export interface StepEvent {
	stepId: string;
	nodeType: string;
	result: NodeResult;
	durationMs: number;
	cached: boolean;
	cost?: StepCostReport;
}
