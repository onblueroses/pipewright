/**
 * Cost-tracked workflow example
 *
 * Demonstrates: CostTracker setup, pricing config, budget enforcement
 * (soft + hard limits), wrapLLMService, and cost report inspection.
 *
 * Run: npx tsx examples/cost-tracked-workflow.ts
 */

import { z } from 'zod';
import {
  defineNode,
  createRegistry,
  createExecutionContext,
  runWorkflow,
  createCostTracker,
  wrapLLMService,
} from '../src/index.js';
import type { CostReport } from '../src/index.js';

// --- Mock LLM service (replace with real provider SDK) ---

const mockLLMService = {
  async generate(prompt: string, model: string) {
    const inputTokens = prompt.length * 2;
    const outputTokens = Math.floor(inputTokens * 0.6);
    return {
      text: `Response to: ${prompt.slice(0, 30)}...`,
      model,
      usage: { inputTokens, outputTokens },
    };
  },
};

// --- Setup ---

const pricing = {
  'gpt-4': { inputPerMillion: 30, outputPerMillion: 60 },
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

const tracker = createCostTracker({
  pricing,
  budget: {
    softLimit: 0.001,
    hardLimit: 0.01,
    onSoftLimit: (report: CostReport) => {
      console.log(`[WARN] Soft budget limit reached: $${report.totalCost.toFixed(6)}`);
    },
  },
});

const llm = wrapLLMService({
  service: mockLLMService,
  tracker,
  methods: {
    generate: {
      extractUsage: (raw) => {
        const r = raw as Awaited<ReturnType<typeof mockLLMService.generate>>;
        return { model: r.model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens };
      },
    },
  },
});

// --- Define workflow nodes ---

const analyzeNode = defineNode({
  type: 'analyze',
  name: 'Analyze Input',
  category: 'action',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ analysis: z.string() }),
  executor: async (input, ctx) => {
    const svc = ctx.services as { llm: typeof llm };
    const result = await svc.llm.generate(
      `Analyze the following topic for a blog post: ${input.topic}`,
      'gpt-4'
    );
    return { success: true, output: { analysis: result.text }, nextNode: 'draft' };
  },
});

const draftNode = defineNode({
  type: 'draft',
  name: 'Draft Content',
  category: 'action',
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ draft: z.string() }),
  executor: async (input, ctx) => {
    const svc = ctx.services as { llm: typeof llm };
    const analysis = ctx.get('analyze.analysis') as string;
    const result = await svc.llm.generate(
      `Write a blog post about "${input.topic}" based on this analysis: ${analysis}`,
      'gpt-3.5-turbo'
    );
    return { success: true, output: { draft: result.text } };
  },
});

// --- Run ---

async function main() {
  const registry = createRegistry();
  registry.register(analyzeNode);
  registry.register(draftNode);

  const ctx = createExecutionContext({ llm });

  const result = await runWorkflow(
    {
      analyze: { nodeType: 'analyze', input: { topic: 'Cost tracking in AI workflows' } },
      draft: { nodeType: 'draft', input: { topic: 'Cost tracking in AI workflows' } },
    },
    'analyze',
    registry,
    ctx,
    { costTracker: tracker }
  );

  console.log('\n--- Workflow Result ---');
  console.log(`Success: ${result.success}`);
  console.log(`Steps: ${result.steps.length}`);

  if (result.cost) {
    console.log('\n--- Cost Report ---');
    console.log(`Total cost: $${result.cost.totalCost.toFixed(6)}`);
    console.log(`Total calls: ${result.cost.totalCalls}`);
    console.log(`Input tokens: ${result.cost.totalInputTokens}`);
    console.log(`Output tokens: ${result.cost.totalOutputTokens}`);

    console.log('\nBy step:');
    for (const [stepId, step] of Object.entries(result.cost.byStep)) {
      console.log(`  ${stepId}: ${step.calls} call(s), $${step.cost.toFixed(6)}`);
    }

    console.log('\nBy model:');
    for (const [model, data] of Object.entries(result.cost.byModel)) {
      console.log(`  ${model}: ${data.calls} call(s), $${data.cost.toFixed(6)}`);
    }
  }
}

main().catch(console.error);
