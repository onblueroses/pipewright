import type { WorkflowStep, WorkflowResult, NodeResult, StepEvent } from './types.js';
import type { NodeRegistry } from './registry.js';
import type { ExecutionContext } from './context.js';
import type { CostTracker } from './cost.js';
import { BudgetExceededError } from './cost.js';
import { z } from 'zod';

const DEFAULT_MAX_STEPS = 100;

export interface WorkflowOptions {
  maxSteps?: number;
  onStep?: (event: StepEvent) => void | Promise<void>;
  costTracker?: CostTracker;
}

export async function runWorkflow(
  steps: Record<string, WorkflowStep>,
  startNode: string,
  registry: NodeRegistry,
  context: ExecutionContext,
  options?: WorkflowOptions
): Promise<WorkflowResult> {
  return executeFromNode(steps, startNode, registry, context, [], options);
}

export async function resumeWorkflow(
  pausedResult: WorkflowResult,
  steps: Record<string, WorkflowStep>,
  registry: NodeRegistry,
  context: ExecutionContext,
  options?: WorkflowOptions
): Promise<WorkflowResult> {
  if (!pausedResult.pausedAt) {
    return {
      steps: [],
      success: false,
      error: 'Cannot resume: workflow was not paused (no pausedAt)',
    };
  }

  const lastStep = pausedResult.steps[pausedResult.steps.length - 1];
  if (!lastStep) {
    return {
      steps: [],
      success: false,
      error: 'Cannot resume: paused result has no executed steps',
    };
  }

  const nextNode = lastStep.result.nextNode;
  if (!nextNode) {
    return {
      steps: [...pausedResult.steps],
      success: true,
    };
  }

  return executeFromNode(
    steps,
    nextNode,
    registry,
    context,
    [...pausedResult.steps],
    options
  );
}

async function executeFromNode(
  steps: Record<string, WorkflowStep>,
  startNode: string,
  registry: NodeRegistry,
  context: ExecutionContext,
  priorSteps: Array<{ stepId: string; nodeType: string; result: NodeResult }>,
  options?: WorkflowOptions
): Promise<WorkflowResult> {
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  const onStep = options?.onStep;
  const costTracker = options?.costTracker;
  const executedSteps = [...priorSteps];
  let currentId: string | undefined = startNode;
  let stepCount = priorSteps.length;

  const withCost = (result: WorkflowResult): WorkflowResult => {
    if (costTracker) result.cost = costTracker.report();
    return result;
  };

  while (currentId !== undefined) {
    if (stepCount >= maxSteps) {
      return withCost({
        steps: executedSteps,
        success: false,
        error: `Workflow exceeded maximum of ${maxSteps} steps (possible cycle). Last step: "${currentId}"`,
      });
    }
    stepCount++;

    const step = steps[currentId];
    if (!step) {
      return withCost({
        steps: executedSteps,
        success: false,
        error: `Step "${currentId}" not found in workflow`,
      });
    }

    const interpolatedInput = context.interpolateObject(step.input);

    let result: NodeResult;
    const startTime = Date.now();

    if (costTracker) {
      costTracker.currentStepId = currentId;
    }

    try {
      result = await registry.execute(step.nodeType, interpolatedInput, context);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return withCost({
          steps: executedSteps,
          success: false,
          error: err.message,
        });
      }
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return withCost({
          steps: executedSteps,
          success: false,
          error: `Node "${step.nodeType}" (step "${currentId}") input validation failed: ${issues}`,
        });
      }
      const error = err instanceof Error ? err.message : String(err);
      return withCost({
        steps: executedSteps,
        success: false,
        error: `Node "${step.nodeType}" (step "${currentId}") threw: ${error}`,
      });
    }

    executedSteps.push({ stepId: currentId, nodeType: step.nodeType, result });

    if (onStep) {
      await onStep({
        stepId: currentId,
        nodeType: step.nodeType,
        result,
        durationMs: Date.now() - startTime,
        cost: costTracker?.stepReport(currentId),
      });
    }

    if (result.output !== undefined) {
      context.setNodeOutput(currentId, result.output);
    }

    if (!result.success) {
      return withCost({
        steps: executedSteps,
        success: false,
        error: result.error ?? `Node "${step.nodeType}" failed`,
      });
    }

    if (result.approvalRequired) {
      return withCost({
        steps: executedSteps,
        success: true,
        pausedAt: currentId,
      });
    }

    currentId = result.nextNode;
  }

  return withCost({
    steps: executedSteps,
    success: true,
  });
}
