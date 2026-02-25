import type { WorkflowStep, WorkflowResult, NodeResult, StepEvent } from './types.js';
import type { NodeRegistry } from './registry.js';
import type { ExecutionContext } from './context.js';

const DEFAULT_MAX_STEPS = 100;

export interface WorkflowOptions {
  maxSteps?: number;
  onStep?: (event: StepEvent) => void | Promise<void>;
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
  const executedSteps = [...priorSteps];
  let currentId: string | undefined = startNode;
  let stepCount = priorSteps.length;

  while (currentId !== undefined) {
    if (stepCount >= maxSteps) {
      return {
        steps: executedSteps,
        success: false,
        error: `Workflow exceeded maximum of ${maxSteps} steps (possible cycle). Last step: "${currentId}"`,
      };
    }
    stepCount++;

    const step = steps[currentId];
    if (!step) {
      return {
        steps: executedSteps,
        success: false,
        error: `Step "${currentId}" not found in workflow`,
      };
    }

    const interpolatedInput = context.interpolateObject(step.input);

    let result: NodeResult;
    const startTime = Date.now();
    try {
      result = await registry.execute(step.nodeType, interpolatedInput, context);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        steps: executedSteps,
        success: false,
        error: `Node "${step.nodeType}" (step "${currentId}") threw: ${error}`,
      };
    }

    executedSteps.push({ stepId: currentId, nodeType: step.nodeType, result });

    if (onStep) {
      await onStep({
        stepId: currentId,
        nodeType: step.nodeType,
        result,
        durationMs: Date.now() - startTime,
      });
    }

    if (result.output !== undefined) {
      context.setNodeOutput(currentId, result.output);
    }

    if (!result.success) {
      return {
        steps: executedSteps,
        success: false,
        error: result.error ?? `Node "${step.nodeType}" failed`,
      };
    }

    if (result.approvalRequired) {
      return {
        steps: executedSteps,
        success: true,
        pausedAt: currentId,
      };
    }

    currentId = result.nextNode;
  }

  return {
    steps: executedSteps,
    success: true,
  };
}
