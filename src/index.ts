// Core engine. This entry needs Zod only.
// Integration and AI nodes: "pipewright/nodes". Store and approval server: "pipewright/infra".

export type { NodeExecutionConfig } from "./core/config.js";
export { resolveNodeConfig } from "./core/config.js";
export { createExecutionContext, ExecutionContext } from "./core/context.js";
export type {
	BudgetConfig,
	CostReport,
	CostTrackerOptions,
	ModelPricing,
	PricingTable,
	StepCostReport,
	TokenUsage,
	WrapLLMServiceOptions,
} from "./core/cost.js";
export {
	BudgetExceededError,
	CostTracker,
	createCostTracker,
	wrapLLMService,
} from "./core/cost.js";
export type {
	DAGDefinition,
	DAGEdge,
	DAGNode,
	DAGOptions,
} from "./core/dag.js";
export { runDAGWorkflow, topologicalSort, validateDAG } from "./core/dag.js";
export { defineNode } from "./core/node.js";
export {
	createRegistry,
	NodeRegistry,
	NodeValidationError,
} from "./core/registry.js";
export type { StepOptions, StepOutcome } from "./core/step.js";
export { NodeTimeoutError, runStep } from "./core/step.js";
export type {
	CacheStore,
	WorkflowState,
	WorkflowStatus,
	WorkflowStore,
} from "./core/stores.js";
export { createMemoryCacheStore, createMemoryStore } from "./core/stores.js";
export type {
	AnyNodeDefinition,
	ApprovalNotifier,
	ExecOptions,
	ExecResult,
	ExecService,
	KnownCredentials,
	NodeCategory,
	NodeCredentials,
	NodeDefinition,
	NodeExecutor,
	NodeMetadata,
	NodeResult,
	NodeServices,
	StepEvent,
	StepRecord,
	WorkflowError,
	WorkflowErrorCode,
	WorkflowResult,
	WorkflowStep,
} from "./core/types.js";
export type { ResumeByIdOptions, WorkflowOptions } from "./core/workflow.js";
export {
	resumeById,
	resumeWorkflow,
	runWorkflow,
	validateWorkflow,
} from "./core/workflow.js";
export type {
	WebhookTriggerInput,
	WebhookTriggerOutput,
} from "./nodes/logic/webhook-trigger.js";
export type { ConditionType } from "./nodes/shared/evaluate.js";
export { CONDITION_TYPES, evaluate } from "./nodes/shared/evaluate.js";
export type {
	SortDirection,
	SortInput,
	SortOutput,
} from "./nodes/transform/sort.js";

import { approvalGateNode } from "./nodes/logic/approval-gate.js";
import { conditionalNode } from "./nodes/logic/conditional.js";
import { delayNode } from "./nodes/logic/delay.js";
import { endNode } from "./nodes/logic/end.js";
import { testGateNode } from "./nodes/logic/test-gate.js";
import { webhookTriggerNode } from "./nodes/logic/webhook-trigger.js";
import { filterNode } from "./nodes/transform/filter.js";
import { mapNode } from "./nodes/transform/map.js";
import { sortNode } from "./nodes/transform/sort.js";

export {
	approvalGateNode,
	conditionalNode,
	delayNode,
	endNode,
	filterNode,
	mapNode,
	sortNode,
	testGateNode,
	webhookTriggerNode,
};

/** The logic and transform nodes. Register them with `registry.registerAll(builtInNodes)`. */
export const builtInNodes = [
	approvalGateNode,
	conditionalNode,
	delayNode,
	endNode,
	testGateNode,
	webhookTriggerNode,
	mapNode,
	filterNode,
	sortNode,
] as const;
