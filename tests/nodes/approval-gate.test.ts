import { describe, it, expect } from 'vitest';
import { approvalGateNode } from '../../src/nodes/logic/approval-gate.js';
import { NodeRegistry } from '../../src/core/registry.js';
import { ExecutionContext } from '../../src/core/context.js';

describe('approval-gate node', () => {
  it('returns approvalRequired: true with message', async () => {
    const registry = new NodeRegistry();
    registry.register(approvalGateNode);
    const ctx = new ExecutionContext();

    const result = await registry.execute('approval-gate', {
      message: 'Review this draft',
      nextNode: 'publish',
    }, ctx);

    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.nextNode).toBe('publish');
    expect(result.output).toEqual({ message: 'Review this draft' });
  });

  it('works without any services', async () => {
    const registry = new NodeRegistry();
    registry.register(approvalGateNode);
    const ctx = new ExecutionContext();

    const result = await registry.execute('approval-gate', {
      message: 'No services needed',
      nextNode: 'next',
    }, ctx);

    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
  });

  it('passes through nextNode from input', async () => {
    const registry = new NodeRegistry();
    registry.register(approvalGateNode);
    const ctx = new ExecutionContext();

    const result = await registry.execute('approval-gate', {
      message: 'Test',
      nextNode: 'custom-step',
    }, ctx);

    expect(result.nextNode).toBe('custom-step');
  });
});
