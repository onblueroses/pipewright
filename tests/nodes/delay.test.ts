import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { delayNode } from '../../src/nodes/logic/delay.js';

describe('delayNode', () => {
  it('waits and returns waited duration', async () => {
    const registry = createRegistry();
    registry.register(delayNode);
    const ctx = createExecutionContext();

    const start = Date.now();
    const result = await runWorkflow(
      { wait: { nodeType: 'delay', input: { milliseconds: 50 } } },
      'wait',
      registry,
      ctx,
    );
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { waited: number };
    expect(output.waited).toBe(50);
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('handles zero delay', async () => {
    const registry = createRegistry();
    registry.register(delayNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { wait: { nodeType: 'delay', input: { milliseconds: 0 } } },
      'wait',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    const output = result.steps[0].result.output as { waited: number };
    expect(output.waited).toBe(0);
  });

  it('follows nextNode', async () => {
    const registry = createRegistry();
    registry.register(delayNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        wait: { nodeType: 'delay', input: { milliseconds: 0, nextNode: 'wait2' } },
        wait2: { nodeType: 'delay', input: { milliseconds: 0 } },
      },
      'wait',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
  });
});
