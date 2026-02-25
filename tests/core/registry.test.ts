import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createRegistry } from '../../src/core/registry.js';
import { defineNode } from '../../src/core/node.js';
import { createExecutionContext } from '../../src/core/context.js';
import { builtInNodes } from '../../src/index.js';

const sampleNode = defineNode({
  type: 'sample',
  name: 'Sample Node',
  category: 'action',
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ greeting: z.string() }),
  executor: async (input) => ({
    success: true,
    output: { greeting: `Hello, ${input.name}!` },
  }),
});

describe('NodeRegistry', () => {
  it('registers a node and retrieves its type', () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    expect(registry.getTypes()).toContain('sample');
  });

  it('throws on duplicate registration', () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    expect(() => registry.register(sampleNode)).toThrow('already registered');
  });

  it('registerAll registers multiple nodes', () => {
    const registry = createRegistry();
    const nodeA = defineNode({ ...sampleNode, type: 'a' });
    const nodeB = defineNode({ ...sampleNode, type: 'b' });
    registry.registerAll([nodeA, nodeB]);
    expect(registry.getTypes()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('execute validates input with Zod', async () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    const ctx = createExecutionContext();
    await expect(registry.execute('sample', { name: 123 }, ctx)).rejects.toThrow();
  });

  it('execute runs executor and returns result', async () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    const ctx = createExecutionContext();
    const result = await registry.execute('sample', { name: 'World' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ greeting: 'Hello, World!' });
  });

  it('execute throws for unknown node type', async () => {
    const registry = createRegistry();
    const ctx = createExecutionContext();
    await expect(registry.execute('unknown', {}, ctx)).rejects.toThrow('not registered');
  });

  it('getMetadata returns metadata without executor or schemas', () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    const meta = registry.getMetadata('sample');
    expect(meta).toBeDefined();
    expect(meta?.type).toBe('sample');
    expect(meta?.name).toBe('Sample Node');
    expect('executor' in (meta ?? {})).toBe(false);
    expect('inputSchema' in (meta ?? {})).toBe(false);
    expect('outputSchema' in (meta ?? {})).toBe(false);
  });

  it('getMetadata returns undefined for unknown type', () => {
    const registry = createRegistry();
    expect(registry.getMetadata('nope')).toBeUndefined();
  });

  it('getByCategory filters correctly', () => {
    const registry = createRegistry();
    const logicNode = defineNode({ ...sampleNode, type: 'logic_one', category: 'logic' });
    registry.register(sampleNode);
    registry.register(logicNode);
    expect(registry.getByCategory('action')).toHaveLength(1);
    expect(registry.getByCategory('logic')).toHaveLength(1);
    expect(registry.getByCategory('transform')).toHaveLength(0);
  });

  it('has() returns true for registered types', () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    expect(registry.has('sample')).toBe(true);
    expect(registry.has('unknown')).toBe(false);
  });

  it('unregister() removes a node type', () => {
    const registry = createRegistry();
    registry.register(sampleNode);
    expect(registry.has('sample')).toBe(true);
    expect(registry.unregister('sample')).toBe(true);
    expect(registry.has('sample')).toBe(false);
    expect(registry.getTypes()).not.toContain('sample');
  });

  it('unregister() returns false for non-existent type', () => {
    const registry = createRegistry();
    expect(registry.unregister('nope')).toBe(false);
  });

  it('registerAll accepts builtInNodes (readonly array)', () => {
    const registry = createRegistry();
    registry.registerAll(builtInNodes);
    expect(registry.has('conditional')).toBe(true);
    expect(registry.has('delay')).toBe(true);
    expect(registry.has('end')).toBe(true);
    expect(registry.has('map')).toBe(true);
    expect(registry.has('filter')).toBe(true);
    expect(registry.has('approval-gate')).toBe(true);
    expect(registry.getTypes()).toHaveLength(6);
  });

  it('validates output schema and throws on violation', async () => {
    const badOutputNode = defineNode({
      type: 'bad_output',
      name: 'Bad Output',
      category: 'action',
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
      executor: async () => ({
        success: true,
        output: { count: 'not-a-number' } as unknown as { count: number },
      }),
    });
    const registry = createRegistry();
    registry.register(badOutputNode);
    const ctx = createExecutionContext();
    await expect(registry.execute('bad_output', {}, ctx)).rejects.toThrow();
  });
});
