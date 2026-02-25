import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { defineNode } from '../../src/core/node.js';
import { runWorkflow, resumeWorkflow } from '../../src/core/workflow.js';
import type { StepEvent } from '../../src/core/types.js';

const makeNode = (type: string, output: unknown, nextNode?: string) =>
  defineNode({
    type,
    name: type,
    category: 'action',
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.unknown(),
    executor: async () => ({ success: true, output, nextNode }),
  });

const makeFailNode = (type: string, error = 'something went wrong') =>
  defineNode({
    type,
    name: type,
    category: 'action',
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.unknown(),
    executor: async () => ({ success: false, error }),
  });

const makeApprovalNode = (type: string) =>
  defineNode({
    type,
    name: type,
    category: 'action',
    inputSchema: z.object({}).passthrough(),
    outputSchema: z.object({ pending: z.boolean() }),
    executor: async () => ({ success: true, output: { pending: true }, approvalRequired: true }),
  });

describe('runWorkflow', () => {
  it('runs a single-node workflow and returns success', async () => {
    const registry = createRegistry();
    registry.register(makeNode('step_a', { value: 1 }));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { a: { nodeType: 'step_a', input: {} } },
      'a',
      registry,
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].nodeType).toBe('step_a');
  });

  it('includes stepId in each result step', async () => {
    const registry = createRegistry();
    registry.register(makeNode('step_a', { fromA: true }, 'b'));
    registry.register(makeNode('step_b', { fromB: true }));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        a: { nodeType: 'step_a', input: {} },
        b: { nodeType: 'step_b', input: {} },
      },
      'a',
      registry,
      ctx
    );

    expect(result.steps[0].stepId).toBe('a');
    expect(result.steps[1].stepId).toBe('b');
  });

  it('runs a linear chain by following nextNode', async () => {
    const registry = createRegistry();
    registry.register(makeNode('step_a', { fromA: true }, 'b'));
    registry.register(makeNode('step_b', { fromB: true }, 'c'));
    registry.register(makeNode('step_c', { fromC: true }));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        a: { nodeType: 'step_a', input: {} },
        b: { nodeType: 'step_b', input: {} },
        c: { nodeType: 'step_c', input: {} },
      },
      'a',
      registry,
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.map((s) => s.nodeType)).toEqual(['step_a', 'step_b', 'step_c']);
  });

  it('stores node output in context for downstream interpolation', async () => {
    const registry = createRegistry();
    registry.register(makeNode('fetch', { count: 5 }, 'check'));
    registry.register(
      defineNode({
        type: 'check',
        name: 'check',
        category: 'logic',
        inputSchema: z.object({ label: z.string() }),
        outputSchema: z.object({ seen: z.string() }),
        executor: async (input) => ({ success: true, output: { seen: input.label } }),
      })
    );
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        fetch: { nodeType: 'fetch', input: {} },
        check: { nodeType: 'check', input: { label: 'count is {{fetch.count}}' } },
      },
      'fetch',
      registry,
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.steps[1].result.output).toEqual({ seen: 'count is 5' });
  });

  it('halts on node failure and returns error', async () => {
    const registry = createRegistry();
    registry.register(makeFailNode('bad_node'));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { start: { nodeType: 'bad_node', input: {} } },
      'start',
      registry,
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('something went wrong');
  });

  it('halts on approvalRequired and sets pausedAt', async () => {
    const registry = createRegistry();
    registry.register(makeApprovalNode('needs_review'));
    registry.register(makeNode('after_review', {}));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        review: { nodeType: 'needs_review', input: {} },
        after: { nodeType: 'after_review', input: {} },
      },
      'review',
      registry,
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.pausedAt).toBe('review');
    expect(result.steps).toHaveLength(1);
  });

  it('returns error for missing step ID', async () => {
    const registry = createRegistry();
    registry.register(makeNode('a', {}, 'nonexistent'));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { start: { nodeType: 'a', input: {} } },
      'start',
      registry,
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('nonexistent');
  });

  it('catches executor exceptions and returns error', async () => {
    const throwingNode = defineNode({
      type: 'thrower',
      name: 'Thrower',
      category: 'action',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      executor: async () => { throw new Error('executor exploded'); },
    });
    const registry = createRegistry();
    registry.register(throwingNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { start: { nodeType: 'thrower', input: {} } },
      'start',
      registry,
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('executor exploded');
  });

  it('stops with error when maxSteps exceeded (cycle protection)', async () => {
    const registry = createRegistry();
    const pingNode = defineNode({
      type: 'ping',
      name: 'Ping',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {}, nextNode: 'b' }),
    });
    const pongNode = defineNode({
      type: 'pong',
      name: 'Pong',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {}, nextNode: 'a' }),
    });
    registry.registerAll([pingNode, pongNode]);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        a: { nodeType: 'ping', input: {} },
        b: { nodeType: 'pong', input: {} },
      },
      'a',
      registry,
      ctx,
      { maxSteps: 10 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('maximum of 10 steps');
    expect(result.steps).toHaveLength(10);
  });

  it('respects custom maxSteps option', async () => {
    const registry = createRegistry();
    const loopNode = defineNode({
      type: 'loop',
      name: 'Loop',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {}, nextNode: 'a' }),
    });
    registry.register(loopNode);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      { a: { nodeType: 'loop', input: {} } },
      'a',
      registry,
      ctx,
      { maxSteps: 3 },
    );

    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(3);
  });

  it('passes actual arrays between nodes via {{ref}} interpolation', async () => {
    const registry = createRegistry();
    const producerNode = defineNode({
      type: 'producer',
      name: 'Producer',
      category: 'action',
      inputSchema: z.object({}),
      outputSchema: z.object({ items: z.array(z.number()) }),
      executor: async () => ({ success: true, output: { items: [10, 20, 30] }, nextNode: 'consumer' }),
    });
    const consumerNode = defineNode({
      type: 'consumer',
      name: 'Consumer',
      category: 'action',
      inputSchema: z.object({ data: z.array(z.number()) }),
      outputSchema: z.object({ sum: z.number() }),
      executor: async (input) => ({
        success: true,
        output: { sum: input.data.reduce((a: number, b: number) => a + b, 0) },
      }),
    });
    registry.registerAll([producerNode, consumerNode]);
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        produce: { nodeType: 'producer', input: {} },
        consumer: { nodeType: 'consumer', input: { data: '{{produce.items}}' } },
      },
      'produce',
      registry,
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.steps[1].result.output).toEqual({ sum: 60 });
  });

  it('supports branching via conditional nextNode', async () => {
    const registry = createRegistry();
    const routerNode = defineNode({
      type: 'router',
      name: 'Router',
      category: 'logic',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      executor: async () => ({ success: true, output: {}, nextNode: 'b' }),
    });
    registry.register(routerNode);
    registry.register(makeNode('step_a', { from: 'a' }));
    registry.register(makeNode('step_b', { from: 'b' }));
    const ctx = createExecutionContext();

    const result = await runWorkflow(
      {
        route: { nodeType: 'router', input: {} },
        a: { nodeType: 'step_a', input: {} },
        b: { nodeType: 'step_b', input: {} },
      },
      'route',
      registry,
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].nodeType).toBe('step_b');
  });
});

describe('resumeWorkflow', () => {
  it('resumes after approval gate and completes remaining steps', async () => {
    const registry = createRegistry();
    const approvalNode = defineNode({
      type: 'needs_review',
      name: 'needs_review',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ pending: z.boolean() }),
      executor: async () => ({
        success: true,
        output: { pending: true },
        approvalRequired: true,
        nextNode: 'after',
      }),
    });
    registry.register(approvalNode);
    registry.register(makeNode('after_review', { done: true }));
    const ctx = createExecutionContext();

    const steps = {
      review: { nodeType: 'needs_review', input: {} },
      after: { nodeType: 'after_review', input: {} },
    };

    const paused = await runWorkflow(steps, 'review', registry, ctx);
    expect(paused.pausedAt).toBe('review');
    expect(paused.steps).toHaveLength(1);

    const resumed = await resumeWorkflow(paused, steps, registry, ctx);
    expect(resumed.success).toBe(true);
    expect(resumed.steps).toHaveLength(2);
    expect(resumed.steps[0].nodeType).toBe('needs_review');
    expect(resumed.steps[1].nodeType).toBe('after_review');
  });

  it('preserves context from paused workflow', async () => {
    const registry = createRegistry();
    const dataNode = defineNode({
      type: 'data_producer',
      name: 'data_producer',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ count: z.number() }),
      executor: async () => ({
        success: true,
        output: { count: 42 },
        nextNode: 'gate',
      }),
    });
    const gateNode = defineNode({
      type: 'gate',
      name: 'gate',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ pending: z.boolean() }),
      executor: async () => ({
        success: true,
        output: { pending: true },
        approvalRequired: true,
        nextNode: 'consumer',
      }),
    });
    const consumerNode = defineNode({
      type: 'consumer',
      name: 'consumer',
      category: 'action',
      inputSchema: z.object({ label: z.string() }),
      outputSchema: z.object({ seen: z.string() }),
      executor: async (input) => ({
        success: true,
        output: { seen: input.label },
      }),
    });
    registry.registerAll([dataNode, gateNode, consumerNode]);
    const ctx = createExecutionContext();

    const steps = {
      produce: { nodeType: 'data_producer', input: {} },
      gate: { nodeType: 'gate', input: {} },
      consumer: { nodeType: 'consumer', input: { label: 'count is {{produce.count}}' } },
    };

    const paused = await runWorkflow(steps, 'produce', registry, ctx);
    expect(paused.pausedAt).toBe('gate');

    const resumed = await resumeWorkflow(paused, steps, registry, ctx);
    expect(resumed.success).toBe(true);
    expect(resumed.steps[2].result.output).toEqual({ seen: 'count is 42' });
  });

  it('returns error when result has no pausedAt', async () => {
    const registry = createRegistry();
    const ctx = createExecutionContext();

    const result = await resumeWorkflow(
      { steps: [], success: true },
      {},
      registry,
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not paused');
  });

  it('fires onStep hook only for resumed steps, not prior ones', async () => {
    const registry = createRegistry();
    const approvalNode = defineNode({
      type: 'needs_review',
      name: 'needs_review',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ pending: z.boolean() }),
      executor: async () => ({
        success: true,
        output: { pending: true },
        approvalRequired: true,
        nextNode: 'after',
      }),
    });
    registry.register(approvalNode);
    registry.register(makeNode('after_review', { done: true }));
    const ctx = createExecutionContext();

    const steps = {
      review: { nodeType: 'needs_review', input: {} },
      after: { nodeType: 'after_review', input: {} },
    };

    const paused = await runWorkflow(steps, 'review', registry, ctx);
    expect(paused.pausedAt).toBe('review');

    const events: StepEvent[] = [];
    const resumed = await resumeWorkflow(paused, steps, registry, ctx, {
      onStep: (e) => events.push(e),
    });

    expect(resumed.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].stepId).toBe('after');
    expect(events[0].nodeType).toBe('after_review');
  });

  it('completes when paused node had no nextNode', async () => {
    const registry = createRegistry();
    const terminalApproval = defineNode({
      type: 'final_review',
      name: 'final_review',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({ pending: z.boolean() }),
      executor: async () => ({
        success: true,
        output: { pending: true },
        approvalRequired: true,
      }),
    });
    registry.register(terminalApproval);
    const ctx = createExecutionContext();

    const steps = { review: { nodeType: 'final_review', input: {} } };
    const paused = await runWorkflow(steps, 'review', registry, ctx);
    expect(paused.pausedAt).toBe('review');

    const resumed = await resumeWorkflow(paused, steps, registry, ctx);
    expect(resumed.success).toBe(true);
    expect(resumed.steps).toHaveLength(1);
  });
});

describe('onStep hook', () => {
  it('fires for each step with correct data', async () => {
    const registry = createRegistry();
    registry.register(makeNode('step_a', { a: 1 }, 'b'));
    registry.register(makeNode('step_b', { b: 2 }));
    const ctx = createExecutionContext();
    const events: StepEvent[] = [];

    await runWorkflow(
      {
        a: { nodeType: 'step_a', input: {} },
        b: { nodeType: 'step_b', input: {} },
      },
      'a',
      registry,
      ctx,
      { onStep: (e) => events.push(e) }
    );

    expect(events).toHaveLength(2);
    expect(events[0].stepId).toBe('a');
    expect(events[0].nodeType).toBe('step_a');
    expect(events[0].result.success).toBe(true);
    expect(typeof events[0].durationMs).toBe('number');
    expect(events[1].stepId).toBe('b');
    expect(events[1].nodeType).toBe('step_b');
  });

  it('includes duration timing', async () => {
    const registry = createRegistry();
    const slowNode = defineNode({
      type: 'slow',
      name: 'Slow',
      category: 'action',
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.object({}),
      executor: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { success: true, output: {} };
      },
    });
    registry.register(slowNode);
    const ctx = createExecutionContext();
    const events: StepEvent[] = [];

    await runWorkflow(
      { s: { nodeType: 'slow', input: {} } },
      's',
      registry,
      ctx,
      { onStep: (e) => events.push(e) }
    );

    expect(events[0].durationMs).toBeGreaterThanOrEqual(40);
  });

  it('does not fire for steps that throw', async () => {
    const throwingNode = defineNode({
      type: 'thrower',
      name: 'Thrower',
      category: 'action',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      executor: async () => { throw new Error('boom'); },
    });
    const registry = createRegistry();
    registry.register(throwingNode);
    const ctx = createExecutionContext();
    const events: StepEvent[] = [];

    const result = await runWorkflow(
      { s: { nodeType: 'thrower', input: {} } },
      's',
      registry,
      ctx,
      { onStep: (e) => events.push(e) }
    );

    expect(result.success).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('fires on failed nodes (success: false)', async () => {
    const registry = createRegistry();
    registry.register(makeFailNode('bad'));
    const ctx = createExecutionContext();
    const events: StepEvent[] = [];

    await runWorkflow(
      { s: { nodeType: 'bad', input: {} } },
      's',
      registry,
      ctx,
      { onStep: (e) => events.push(e) }
    );

    expect(events).toHaveLength(1);
    expect(events[0].result.success).toBe(false);
  });
});
