// Core
export { defineNode } from './core/node.js';
export { NodeRegistry, createRegistry } from './core/registry.js';
export { ExecutionContext, createExecutionContext } from './core/context.js';
export { runWorkflow, resumeWorkflow } from './core/workflow.js';
export { CostTracker, createCostTracker, wrapLLMService, BudgetExceededError } from './core/cost.js';
export type {
  NodeDefinition,
  NodeResult,
  NodeExecutor,
  NodeCategory,
  NodeCapabilities,
  NodeMetadata,
  NodeServices,
  WorkflowStep,
  WorkflowResult,
  StepEvent,
} from './core/types.js';
export type { WorkflowOptions } from './core/workflow.js';
export type {
  CostTrackerOptions,
  CostReport,
  StepCostReport,
  TokenUsage,
  ModelPricing,
  PricingTable,
  BudgetConfig,
  WrapLLMServiceOptions,
} from './core/cost.js';

// Shared utilities
export { evaluate, CONDITION_TYPES } from './nodes/shared/evaluate.js';
export type { ConditionType } from './nodes/shared/evaluate.js';

// Built-in nodes
import { conditionalNode } from './nodes/logic/conditional.js';
import { delayNode } from './nodes/logic/delay.js';
import { endNode } from './nodes/logic/end.js';
import { mapNode } from './nodes/transform/map.js';
import { filterNode } from './nodes/transform/filter.js';
import { approvalGateNode } from './nodes/logic/approval-gate.js';

export { conditionalNode, delayNode, endNode, mapNode, filterNode, approvalGateNode };

export const builtInNodes = [conditionalNode, delayNode, endNode, mapNode, filterNode, approvalGateNode] as const;
