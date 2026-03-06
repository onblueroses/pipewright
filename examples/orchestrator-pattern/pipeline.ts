/**
 * Orchestrator pattern: plan -> work -> verify -> [pass: done, fail: retry loop]
 *
 * Demonstrates how test-gate + conditional compose into a verify-then-fix loop
 * without a dedicated retry node. Retry is expressed as workflow topology.
 */
import {
  createRegistry,
  createExecutionContext,
  runWorkflow,
  builtInNodes,
  defineNode,
  type ExecService,
  type WorkflowStep,
} from 'pipewright';
import { createExecService } from '../infra/exec-service.js';
import { z } from 'zod';

const MAX_RETRIES = 3;

// Stub nodes - replace with real implementations
const planTask = defineNode({
  type: 'plan-task',
  name: 'Plan Task',
  category: 'action',
  inputSchema: z.object({ task: z.string() }),
  outputSchema: z.object({ plan: z.string() }),
  executor: async (input) => ({
    success: true,
    output: { plan: `Plan for: ${input.task}` },
    nextNode: 'work',
  }),
});

const doWork = defineNode({
  type: 'do-work',
  name: 'Do Work',
  category: 'action',
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({ artifact: z.string() }),
  executor: async (_input, context) => {
    const plan = context.get('plan.plan') as string ?? 'no plan';
    console.log(`Working on: ${plan}`);
    return {
      success: true,
      output: { artifact: 'generated-code.ts' },
      nextNode: 'verify',
    };
  },
});

const fixTask = defineNode({
  type: 'fix-task',
  name: 'Fix Task',
  category: 'action',
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({ fixed: z.boolean() }),
  executor: async (_input, context) => {
    const stderr = context.get('verify.stderr') as string;
    const retryCount = (context.get('_retryCount') as number) ?? 0;
    console.log(`Fix attempt ${retryCount + 1}: ${stderr}`);
    context.set('_retryCount', retryCount + 1);
    return {
      success: true,
      output: { fixed: true },
      nextNode: 'work',
    };
  },
});

const doneNode = defineNode({
  type: 'pipeline-done',
  name: 'Done',
  category: 'action',
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({ message: z.string() }),
  executor: async () => ({
    success: true,
    output: { message: 'Pipeline completed successfully' },
  }),
});

const failedNode = defineNode({
  type: 'pipeline-failed',
  name: 'Failed',
  category: 'action',
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({ message: z.string() }),
  executor: async (_input, context) => ({
    success: true,
    output: { message: `Pipeline failed after ${context.get('_retryCount')} retries` },
  }),
});

const steps: Record<string, WorkflowStep> = {
  plan: {
    nodeType: 'plan-task',
    input: { task: 'Build a widget' },
  },
  work: {
    nodeType: 'do-work',
    input: {},
  },
  verify: {
    nodeType: 'test-gate',
    input: {
      command: 'npm test',
      passNode: 'done',
      failNode: 'check_retries',
    },
  },
  check_retries: {
    nodeType: 'conditional',
    input: {
      variable: '_retryCount',
      condition: 'less_than',
      value: MAX_RETRIES,
      trueNode: 'fix',
      falseNode: 'failed',
    },
  },
  fix: {
    nodeType: 'fix-task',
    input: {},
  },
  done: {
    nodeType: 'pipeline-done',
    input: {},
  },
  failed: {
    nodeType: 'pipeline-failed',
    input: {},
  },
};

async function main() {
  const registry = createRegistry();
  registry.registerAll(builtInNodes);
  registry.register(planTask);
  registry.register(doWork);
  registry.register(fixTask);
  registry.register(doneNode);
  registry.register(failedNode);

  const exec: ExecService = createExecService();
  const context = createExecutionContext({ exec }, { _retryCount: 0 });

  console.log('Starting orchestrator pipeline...\n');
  const result = await runWorkflow(steps, 'plan', registry, context);

  console.log('\n--- Result ---');
  console.log(`Success: ${result.success}`);
  console.log(`Steps executed: ${result.steps.length}`);

  const lastStep = result.steps[result.steps.length - 1];
  console.log(`Final output: ${JSON.stringify(lastStep.result.output)}`);
}

main().catch(console.error);
