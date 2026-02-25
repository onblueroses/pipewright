import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  CostTracker,
  createCostTracker,
  wrapLLMService,
  BudgetExceededError,
} from '../../src/core/cost.js';
import type { CostReport, TokenUsage } from '../../src/core/cost.js';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { defineNode } from '../../src/core/node.js';
import { runWorkflow } from '../../src/core/workflow.js';
import type { StepEvent } from '../../src/core/types.js';

const PRICING = {
  'gpt-4': { inputPerMillion: 30, outputPerMillion: 60 },
  'gpt-3.5': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

const usage = (model: string, inputTokens: number, outputTokens: number): TokenUsage => ({
  model,
  inputTokens,
  outputTokens,
});

describe('CostTracker', () => {
  describe('recordUsage', () => {
    it('accumulates token counts across calls', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.recordUsage(usage('gpt-4', 1000, 500));
      tracker.recordUsage(usage('gpt-4', 2000, 1000));

      const report = tracker.report();
      expect(report.totalInputTokens).toBe(3000);
      expect(report.totalOutputTokens).toBe(1500);
      expect(report.totalCalls).toBe(2);
    });

    it('calculates cost correctly from pricing table', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.recordUsage(usage('gpt-4', 1_000_000, 1_000_000));

      const report = tracker.report();
      expect(report.totalCost).toBeCloseTo(90, 4);
    });

    it('attributes usage to current step', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.currentStepId = 'step-a';
      tracker.recordUsage(usage('gpt-4', 1000, 500));
      tracker.currentStepId = 'step-b';
      tracker.recordUsage(usage('gpt-4', 2000, 1000));

      const report = tracker.report();
      expect(report.byStep['step-a'].inputTokens).toBe(1000);
      expect(report.byStep['step-b'].inputTokens).toBe(2000);
    });

    it('attributes usage to model', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.recordUsage(usage('gpt-4', 1000, 500));
      tracker.recordUsage(usage('gpt-3.5', 5000, 2000));

      const report = tracker.report();
      expect(report.byModel['gpt-4'].calls).toBe(1);
      expect(report.byModel['gpt-3.5'].calls).toBe(1);
      expect(report.byModel['gpt-3.5'].inputTokens).toBe(5000);
    });

    it('accumulates multiple calls within same step', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.currentStepId = 'step-a';
      tracker.recordUsage(usage('gpt-4', 1000, 500));
      tracker.recordUsage(usage('gpt-4', 2000, 1000));

      const stepReport = tracker.stepReport('step-a');
      expect(stepReport?.calls).toBe(2);
      expect(stepReport?.inputTokens).toBe(3000);
      expect(stepReport?.outputTokens).toBe(1500);
    });

    it('records usage with no currentStepId set', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.recordUsage(usage('gpt-4', 1000, 500));

      const report = tracker.report();
      expect(report.totalCalls).toBe(1);
      expect(Object.keys(report.byStep)).toHaveLength(0);
    });
  });

  describe('checkBudget', () => {
    it('throws BudgetExceededError when hard limit reached', () => {
      const tracker = createCostTracker({
        pricing: PRICING,
        budget: { hardLimit: 0.001 },
      });
      tracker.recordUsage(usage('gpt-4', 1000, 0));

      expect(() => tracker.checkBudget()).toThrow(BudgetExceededError);
    });

    it('passes when under hard limit', () => {
      const tracker = createCostTracker({
        pricing: PRICING,
        budget: { hardLimit: 1.0 },
      });
      tracker.recordUsage(usage('gpt-4', 1000, 0));

      expect(() => tracker.checkBudget()).not.toThrow();
    });

    it('does not throw when no budget configured', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.recordUsage(usage('gpt-4', 1_000_000, 1_000_000));

      expect(() => tracker.checkBudget()).not.toThrow();
    });
  });

  describe('report', () => {
    it('returns empty report with zero totals when no usage recorded', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      const report = tracker.report();

      expect(report.totalCost).toBe(0);
      expect(report.totalInputTokens).toBe(0);
      expect(report.totalOutputTokens).toBe(0);
      expect(report.totalCalls).toBe(0);
      expect(Object.keys(report.byStep)).toHaveLength(0);
      expect(Object.keys(report.byModel)).toHaveLength(0);
    });

    it('aggregates byStep and byModel correctly', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.currentStepId = 'analyze';
      tracker.recordUsage(usage('gpt-4', 5000, 2000));
      tracker.recordUsage(usage('gpt-3.5', 10000, 5000));
      tracker.currentStepId = 'draft';
      tracker.recordUsage(usage('gpt-4', 3000, 1000));

      const report = tracker.report();
      expect(Object.keys(report.byStep)).toHaveLength(2);
      expect(Object.keys(report.byModel)).toHaveLength(2);
      expect(report.byStep['analyze'].calls).toBe(2);
      expect(report.byStep['draft'].calls).toBe(1);
      expect(report.byModel['gpt-4'].calls).toBe(2);
      expect(report.byModel['gpt-3.5'].calls).toBe(1);
    });
  });

  describe('stepReport', () => {
    it('returns undefined for unknown step', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      expect(tracker.stepReport('nonexistent')).toBeUndefined();
    });

    it('returns correct step-scoped report', () => {
      const tracker = createCostTracker({ pricing: PRICING });
      tracker.currentStepId = 'step-x';
      tracker.recordUsage(usage('gpt-4', 1000, 500));

      const sr = tracker.stepReport('step-x');
      expect(sr?.stepId).toBe('step-x');
      expect(sr?.calls).toBe(1);
      expect(sr?.cost).toBeGreaterThan(0);
    });
  });

  describe('soft limit', () => {
    it('fires callback once when soft limit crossed', () => {
      const onSoftLimit = vi.fn();
      const tracker = createCostTracker({
        pricing: PRICING,
        budget: { softLimit: 0.001, onSoftLimit },
      });

      tracker.recordUsage(usage('gpt-4', 1000, 0));
      tracker.recordUsage(usage('gpt-4', 1000, 0));

      expect(onSoftLimit).toHaveBeenCalledTimes(1);
    });

    it('receives correct report in callback', () => {
      let capturedReport: CostReport | undefined;
      const tracker = createCostTracker({
        pricing: PRICING,
        budget: {
          softLimit: 0.001,
          onSoftLimit: (report) => { capturedReport = report; },
        },
      });

      tracker.recordUsage(usage('gpt-4', 1000, 0));

      expect(capturedReport).toBeDefined();
      expect(capturedReport!.totalCost).toBeGreaterThan(0);
      expect(capturedReport!.totalCalls).toBe(1);
    });
  });

  describe('unknown model', () => {
    it('error policy throws on unknown model', () => {
      const tracker = createCostTracker({
        pricing: PRICING,
        unknownModelPolicy: 'error',
      });

      expect(() => tracker.recordUsage(usage('claude-3', 1000, 500))).toThrow(
        'Unknown model "claude-3" not in pricing table'
      );
    });

    it('zero policy records $0 cost for unknown model', () => {
      const tracker = createCostTracker({
        pricing: PRICING,
        unknownModelPolicy: 'zero',
      });

      tracker.recordUsage(usage('claude-3', 1000, 500));

      const report = tracker.report();
      expect(report.totalCost).toBe(0);
      expect(report.totalInputTokens).toBe(1000);
      expect(report.totalCalls).toBe(1);
    });

    it('defaults to zero policy', () => {
      const tracker = createCostTracker({ pricing: PRICING });

      expect(() => tracker.recordUsage(usage('unknown-model', 100, 50))).not.toThrow();
      expect(tracker.report().totalCost).toBe(0);
    });
  });
});

describe('BudgetExceededError', () => {
  it('has correct code and message', () => {
    const report: CostReport = {
      totalCost: 1.5,
      totalInputTokens: 50000,
      totalOutputTokens: 25000,
      totalCalls: 10,
      byStep: {},
      byModel: {},
    };
    const err = new BudgetExceededError(report, 1.0);

    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(err.name).toBe('BudgetExceededError');
    expect(err.report).toBe(report);
    expect(err.message).toContain('1.5000');
    expect(err.message).toContain('1.0000');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('wrapLLMService', () => {
  const makeMockService = () => ({
    generate: vi.fn(async (_prompt: string, _model: string) => ({
      text: 'hello',
      usage: { inputTokens: 100, outputTokens: 50 },
    })),
    embed: vi.fn(async (_text: string) => ({
      vector: [0.1, 0.2],
      usage: { inputTokens: 50, outputTokens: 0 },
    })),
  });

  it('calls original method and returns its result', async () => {
    const service = makeMockService();
    const tracker = createCostTracker({ pricing: PRICING });

    const wrapped = wrapLLMService({
      service,
      tracker,
      methods: {
        generate: {
          extractUsage: (r) => ({ model: 'gpt-4', inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }),
        },
      },
    });

    const result = await wrapped.generate('hello', 'gpt-4');
    expect(result.text).toBe('hello');
    expect(service.generate).toHaveBeenCalledWith('hello', 'gpt-4');
  });

  it('records usage after call', async () => {
    const service = makeMockService();
    const tracker = createCostTracker({ pricing: PRICING });

    const wrapped = wrapLLMService({
      service,
      tracker,
      methods: {
        generate: {
          extractUsage: (r) => ({ model: 'gpt-4', inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }),
        },
      },
    });

    await wrapped.generate('hello', 'gpt-4');

    const report = tracker.report();
    expect(report.totalCalls).toBe(1);
    expect(report.totalInputTokens).toBe(100);
    expect(report.totalOutputTokens).toBe(50);
  });

  it('checks budget before call', async () => {
    const service = makeMockService();
    const tracker = createCostTracker({
      pricing: PRICING,
      budget: { hardLimit: 0.0001 },
    });

    tracker.recordUsage(usage('gpt-4', 100000, 50000));

    const wrapped = wrapLLMService({
      service,
      tracker,
      methods: {
        generate: {
          extractUsage: (r) => ({ model: 'gpt-4', inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }),
        },
      },
    });

    await expect(wrapped.generate('hello', 'gpt-4')).rejects.toThrow(BudgetExceededError);
    expect(service.generate).not.toHaveBeenCalled();
  });

  it('respects getModel override', async () => {
    const service = makeMockService();
    const tracker = createCostTracker({ pricing: PRICING });

    const wrapped = wrapLLMService({
      service,
      tracker,
      methods: {
        generate: {
          extractUsage: (r) => ({ model: 'unknown', inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }),
          getModel: (_prompt: string, model: string) => model,
        },
      },
    });

    await wrapped.generate('hello', 'gpt-3.5');

    const report = tracker.report();
    expect(report.byModel['gpt-3.5']).toBeDefined();
    expect(report.byModel['unknown']).toBeUndefined();
  });

  it('does not wrap methods not listed in config', async () => {
    const service = makeMockService();
    const tracker = createCostTracker({ pricing: PRICING });

    const wrapped = wrapLLMService({
      service,
      tracker,
      methods: {
        generate: {
          extractUsage: (r) => ({ model: 'gpt-4', inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens }),
        },
      },
    });

    await wrapped.embed('hello');
    expect(tracker.report().totalCalls).toBe(0);
  });
});

describe('workflow integration', () => {
  it('attaches cost to successful workflow result', async () => {
    const tracker = createCostTracker({ pricing: PRICING });
    const registry = createRegistry();

    const node = defineNode({
      type: 'llm-call',
      name: 'LLM Call',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      executor: async (_input, ctx) => {
        const t = (ctx.services as { tracker: CostTracker }).tracker;
        t.recordUsage({ model: 'gpt-4', inputTokens: 1000, outputTokens: 500 });
        return { success: true, output: { text: 'done' } };
      },
    });
    registry.register(node);

    const ctx = createExecutionContext({ tracker });
    const result = await runWorkflow(
      { a: { nodeType: 'llm-call', input: {} } },
      'a',
      registry,
      ctx,
      { costTracker: tracker }
    );

    expect(result.success).toBe(true);
    expect(result.cost).toBeDefined();
    expect(result.cost!.totalCalls).toBe(1);
    expect(result.cost!.totalInputTokens).toBe(1000);
    expect(result.cost!.byStep['a']).toBeDefined();
  });

  it('attaches cost to budget-exceeded result', async () => {
    const tracker = createCostTracker({
      pricing: PRICING,
      budget: { hardLimit: 0.0001 },
    });

    tracker.recordUsage({ model: 'gpt-4', inputTokens: 100000, outputTokens: 50000 });

    const registry = createRegistry();
    const node = defineNode({
      type: 'llm-call',
      name: 'LLM Call',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      executor: async () => {
        tracker.checkBudget();
        return { success: true, output: {} };
      },
    });
    registry.register(node);

    const ctx = createExecutionContext();
    const result = await runWorkflow(
      { a: { nodeType: 'llm-call', input: {} } },
      'a',
      registry,
      ctx,
      { costTracker: tracker }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Budget exceeded');
    expect(result.cost).toBeDefined();
    expect(result.cost!.totalCost).toBeGreaterThan(0);
  });

  it('includes cost in onStep callback', async () => {
    const tracker = createCostTracker({ pricing: PRICING });
    const events: StepEvent[] = [];
    const registry = createRegistry();

    const node = defineNode({
      type: 'llm-call',
      name: 'LLM Call',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      executor: async () => {
        tracker.recordUsage({ model: 'gpt-4', inputTokens: 500, outputTokens: 200 });
        return { success: true, output: {} };
      },
    });
    registry.register(node);

    const ctx = createExecutionContext();
    await runWorkflow(
      { a: { nodeType: 'llm-call', input: {} } },
      'a',
      registry,
      ctx,
      { costTracker: tracker, onStep: (e) => events.push(e) }
    );

    expect(events).toHaveLength(1);
    expect(events[0].cost).toBeDefined();
    expect(events[0].cost!.stepId).toBe('a');
    expect(events[0].cost!.calls).toBe(1);
  });
});
