import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { mapNode } from '../../src/nodes/transform/map.js';
import { defineNode } from '../../src/core/node.js';

const collectNode = defineNode({
  type: 'collect',
  name: 'Collect',
  category: 'action',
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.unknown(),
  executor: async (_input, context) => ({
    success: true,
    output: { collected: context.get('map.items') },
  }),
});

describe('mapNode', () => {
  it('maps items through a template', async () => {
    const registry = createRegistry();
    registry.registerAll([mapNode, collectNode]);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        transform: {
          nodeType: 'map',
          input: {
            items: [
              { name: 'Alice', score: 10 },
              { name: 'Bob', score: 20 },
            ],
            template: { label: '{{item.name}} scored {{item.score}}' },
          },
        },
      },
      'transform',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[]; count: number };
    expect(output.count).toBe(2);
    expect(output.items[0]).toEqual({ label: 'Alice scored 10' });
    expect(output.items[1]).toEqual({ label: 'Bob scored 20' });
  });

  it('handles empty array', async () => {
    const registry = createRegistry();
    registry.register(mapNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        transform: { nodeType: 'map', input: { items: [], template: { x: '{{item.y}}' } } },
      },
      'transform',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[]; count: number };
    expect(output.count).toBe(0);
    expect(output.items).toEqual([]);
  });

  it('preserves parent context vars in template', async () => {
    const registry = createRegistry();
    registry.register(mapNode);
    const ctx = createExecutionContext({}, { prefix: 'User' });

    const result = await runWorkflow(
      {
        transform: {
          nodeType: 'map',
          input: {
            items: [{ name: 'Alice' }],
            template: { label: '{{prefix}}: {{item.name}}' },
          },
        },
      },
      'transform',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { items: unknown[] };
    expect(output.items[0]).toEqual({ label: 'User: Alice' });
  });

  it('follows nextNode when provided', async () => {
    const registry = createRegistry();
    registry.registerAll([mapNode, collectNode]);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        transform: {
          nodeType: 'map',
          input: { items: [{ v: 1 }], template: { x: '{{item.v}}' }, nextNode: 'done' },
        },
        done: { nodeType: 'collect', input: {} },
      },
      'transform',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
  });
});
