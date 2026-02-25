import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { filterNode } from '../../src/nodes/transform/filter.js';

describe('filterNode', () => {
  it('filters items by greater_than', async () => {
    const registry = createRegistry();
    registry.register(filterNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        f: {
          nodeType: 'filter',
          input: {
            items: [
              { name: 'A', score: 3 },
              { name: 'B', score: 7 },
              { name: 'C', score: 1 },
            ],
            variable: 'score',
            condition: 'greater_than',
            value: 2,
          },
        },
      },
      'f',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[]; count: number; filtered: number };
    expect(output.count).toBe(2);
    expect(output.filtered).toBe(1);
    expect(output.items).toEqual([
      { name: 'A', score: 3 },
      { name: 'B', score: 7 },
    ]);
  });

  it('filters by equals', async () => {
    const registry = createRegistry();
    registry.register(filterNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        f: {
          nodeType: 'filter',
          input: {
            items: [{ status: 'active' }, { status: 'archived' }, { status: 'active' }],
            variable: 'status',
            condition: 'equals',
            value: 'active',
          },
        },
      },
      'f',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[]; count: number };
    expect(output.count).toBe(2);
  });

  it('filters by exists', async () => {
    const registry = createRegistry();
    registry.register(filterNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        f: {
          nodeType: 'filter',
          input: {
            items: [{ tag: 'yes' }, {}, { tag: null }, { tag: 'ok' }],
            variable: 'tag',
            condition: 'exists',
          },
        },
      },
      'f',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[]; count: number; filtered: number };
    expect(output.count).toBe(2);
    expect(output.filtered).toBe(2);
  });

  it('returns all items when none are filtered', async () => {
    const registry = createRegistry();
    registry.register(filterNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        f: {
          nodeType: 'filter',
          input: {
            items: [{ v: 10 }, { v: 20 }],
            variable: 'v',
            condition: 'greater_than',
            value: 0,
          },
        },
      },
      'f',
      registry,
      ctx,
    );

    const output = result.steps[0].result.output as { count: number; filtered: number };
    expect(output.count).toBe(2);
    expect(output.filtered).toBe(0);
  });

  it('handles empty array', async () => {
    const registry = createRegistry();
    registry.register(filterNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        f: {
          nodeType: 'filter',
          input: { items: [], variable: 'x', condition: 'exists' },
        },
      },
      'f',
      registry,
      ctx,
    );

    const output = result.steps[0].result.output as { count: number };
    expect(output.count).toBe(0);
  });
});
