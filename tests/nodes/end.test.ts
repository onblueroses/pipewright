import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { endNode } from '../../src/nodes/logic/end.js';
import { defineNode } from '../../src/core/node.js';

describe('endNode', () => {
  it('terminates workflow with no nextNode', async () => {
    const registry = createRegistry();
    registry.register(endNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { stop: { nodeType: 'end', input: {} } },
      'stop',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    const output = result.steps[0].result.output as { terminatedAt: string };
    expect(output.terminatedAt).toBeTruthy();
    expect(new Date(output.terminatedAt).getTime()).not.toBeNaN();
  });

  it('includes optional message', async () => {
    const registry = createRegistry();
    registry.register(endNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { stop: { nodeType: 'end', input: { message: 'All done' } } },
      'stop',
      registry,
      ctx,
    );

    const output = result.steps[0].result.output as { message: string };
    expect(output.message).toBe('All done');
  });

  it('stops a chain when reached', async () => {
    const passthrough = defineNode({
      type: 'pass',
      name: 'Pass',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {}, nextNode: 'stop' }),
    });
    const unreachable = defineNode({
      type: 'unreachable',
      name: 'Unreachable',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {} }),
    });

    const registry = createRegistry();
    registry.registerAll([passthrough, endNode, unreachable]);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        start: { nodeType: 'pass', input: {} },
        stop: { nodeType: 'end', input: { message: 'stopped' } },
        never: { nodeType: 'unreachable', input: {} },
      },
      'start',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((s) => s.nodeType)).toEqual(['pass', 'end']);
  });
});
