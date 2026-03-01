import type { ZodType } from 'zod';
import type { CostReport, StepCostReport } from './cost.js';

export type NodeCategory = 'action' | 'logic' | 'integration' | 'transform';

export interface NodeCapabilities {
  /** @deprecated Unused by engine. Reserved for future use. */
  supportsRerun?: boolean;
  /** @deprecated Unused by engine. Reserved for future use. */
  supportsBulkActions?: boolean;
  supportsApproval?: boolean;
}

export interface NodeDefinition<TInput = unknown, TOutput = unknown> {
  type: string;
  name: string;
  description?: string;
  category: NodeCategory;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  executor: NodeExecutor<TInput, TOutput>;
  /** @deprecated Unused by engine. Reserved for future use. */
  estimatedDuration?: number;
  capabilities?: NodeCapabilities;
}

export interface NodeResult<TOutput = unknown> {
  success: boolean;
  output?: TOutput;
  error?: string;
  nextNode?: string;
  approvalRequired?: boolean;
}

export type NodeExecutor<TInput, TOutput> = (
  input: TInput,
  context: ExecutionContext
) => Promise<NodeResult<TOutput>>;

export interface NodeServices {
  [key: string]: unknown;
}

export type NodeMetadata = Omit<NodeDefinition, 'executor' | 'inputSchema' | 'outputSchema'>;

export interface ExecutionContext {
  readonly services: NodeServices;
  setNodeOutput(stepId: string, output: unknown): void;
  get(path: string): unknown;
  set(key: string, value: unknown): void;
  interpolate(template: string): unknown;
  interpolateObject<T extends Record<string, unknown>>(obj: T): T;
  snapshot(): Record<string, unknown>;
}

export interface WorkflowStep {
  nodeType: string;
  input: Record<string, unknown>;
}

export interface WorkflowResult {
  steps: Array<{ stepId: string; nodeType: string; result: NodeResult }>;
  success: boolean;
  pausedAt?: string;
  error?: string;
  cost?: CostReport;
}

export interface StepEvent {
  stepId: string;
  nodeType: string;
  result: NodeResult;
  durationMs: number;
  cost?: StepCostReport;
}
