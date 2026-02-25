import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { conditionalNode } from '../../src/nodes/logic/conditional.js';
import { defineNode } from '../../src/core/node.js';
import { z } from 'zod';

const terminalNode = (type: string) =>
  defineNode({
    type,
    name: type,
    category: 'action',
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({ reached: z.string() }),
    executor: async () => ({ success: true, output: { reached: type } }),
  });

async function runConditional(
  variable: string,
  condition: string,
  value: unknown,
  contextVars: Record<string, unknown>
) {
  const registry = createRegistry();
  registry.register(conditionalNode);
  registry.register(terminalNode('true_branch'));
  registry.register(terminalNode('false_branch'));

  const ctx = createExecutionContext({}, contextVars);

  const result = await runWorkflow(
    {
      check: {
        nodeType: 'conditional',
        input: { variable, condition, value, trueNode: 'then', falseNode: 'else' },
      },
      then: { nodeType: 'true_branch', input: {} },
      else: { nodeType: 'false_branch', input: {} },
    },
    'check',
    registry,
    ctx
  );

  const conditionalResult = result.steps[0].result;
  const branchResult = result.steps[1].result;
  return {
    matched: (conditionalResult.output as { matched: boolean }).matched,
    reachedBranch: (branchResult.output as { reached: string }).reached,
    success: result.success,
  };
}

describe('conditionalNode - condition types', () => {
  describe('equals', () => {
    it('matches when values are strictly equal', async () => {
      const r = await runConditional('count', 'equals', 5, { count: 5 });
      expect(r.matched).toBe(true);
      expect(r.reachedBranch).toBe('true_branch');
    });

    it('does not match when values differ', async () => {
      const r = await runConditional('count', 'equals', 5, { count: 10 });
      expect(r.matched).toBe(false);
      expect(r.reachedBranch).toBe('false_branch');
    });

    it('works with string values', async () => {
      const r = await runConditional('status', 'equals', 'active', { status: 'active' });
      expect(r.matched).toBe(true);
    });
  });

  describe('not_equals', () => {
    it('matches when values differ', async () => {
      const r = await runConditional('status', 'not_equals', 'inactive', { status: 'active' });
      expect(r.matched).toBe(true);
    });
  });

  describe('greater_than', () => {
    it('matches when resolved > value', async () => {
      const r = await runConditional('score', 'greater_than', 3, { score: 5 });
      expect(r.matched).toBe(true);
    });

    it('does not match when resolved <= value', async () => {
      const r = await runConditional('score', 'greater_than', 5, { score: 5 });
      expect(r.matched).toBe(false);
    });

    it('returns false for non-numeric values', async () => {
      const r = await runConditional('label', 'greater_than', 3, { label: 'hello' });
      expect(r.matched).toBe(false);
    });
  });

  describe('less_than', () => {
    it('matches when resolved < value', async () => {
      const r = await runConditional('score', 'less_than', 10, { score: 3 });
      expect(r.matched).toBe(true);
    });
  });

  describe('contains', () => {
    it('matches substring in string', async () => {
      const r = await runConditional('title', 'contains', 'overview', {
        title: 'Technology overview document',
      });
      expect(r.matched).toBe(true);
    });

    it('does not match missing substring', async () => {
      const r = await runConditional('title', 'contains', 'bitcoin', {
        title: 'Technology overview document',
      });
      expect(r.matched).toBe(false);
    });

    it('matches item in array', async () => {
      const r = await runConditional('tags', 'contains', 'web', { tags: ['web', 'api'] });
      expect(r.matched).toBe(true);
    });

    it('does not match missing array item', async () => {
      const r = await runConditional('tags', 'contains', 'crypto', { tags: ['web', 'api'] });
      expect(r.matched).toBe(false);
    });
  });

  describe('exists', () => {
    it('matches when variable is defined', async () => {
      const r = await runConditional('result', 'exists', undefined, { result: { data: 1 } });
      expect(r.matched).toBe(true);
    });

    it('does not match when variable is undefined', async () => {
      const r = await runConditional('missing', 'exists', undefined, {});
      expect(r.matched).toBe(false);
    });

    it('does not match when variable is null', async () => {
      const r = await runConditional('nullVar', 'exists', undefined, { nullVar: null });
      expect(r.matched).toBe(false);
    });
  });

  describe('not_contains', () => {
    it('matches when substring is absent', async () => {
      const r = await runConditional('title', 'not_contains', 'bitcoin', {
        title: 'Technology overview document',
      });
      expect(r.matched).toBe(true);
    });
  });

  describe('not_exists', () => {
    it('matches when variable is undefined', async () => {
      const r = await runConditional('missing', 'not_exists', undefined, {});
      expect(r.matched).toBe(true);
    });

    it('matches when variable is null', async () => {
      const r = await runConditional('nullVar', 'not_exists', undefined, { nullVar: null });
      expect(r.matched).toBe(true);
    });
  });

  describe('numeric coercion', () => {
    it('coerces string value to number for greater_than', async () => {
      const r = await runConditional('score', 'greater_than', '3', { score: 5 });
      expect(r.matched).toBe(true);
    });

    it('coerces string resolved value to number for less_than', async () => {
      const r = await runConditional('score', 'less_than', 10, { score: '3' });
      expect(r.matched).toBe(true);
    });

    it('returns false for non-numeric strings', async () => {
      const r = await runConditional('label', 'greater_than', 'abc', { label: 5 });
      expect(r.matched).toBe(false);
    });

    it('returns false for empty string', async () => {
      const r = await runConditional('score', 'greater_than', '', { score: 5 });
      expect(r.matched).toBe(false);
    });
  });

  describe('dot-notation variable paths', () => {
    it('resolves nested path from node output', async () => {
      const registry = createRegistry();
      registry.register(conditionalNode);
      registry.register(terminalNode('true_branch'));
      registry.register(terminalNode('false_branch'));

      const ctx = createExecutionContext();
      ctx.setNodeOutput('fetch', { count: 7 });

      const result = await runWorkflow(
        {
          check: {
            nodeType: 'conditional',
            input: {
              variable: 'fetch.count',
              condition: 'greater_than',
              value: 0,
              trueNode: 'then',
              falseNode: 'else',
            },
          },
          then: { nodeType: 'true_branch', input: {} },
          else: { nodeType: 'false_branch', input: {} },
        },
        'check',
        registry,
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.steps[1].result.output).toEqual({ reached: 'true_branch' });
    });
  });
});
