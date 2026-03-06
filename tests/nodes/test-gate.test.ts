import { describe, it, expect, vi } from 'vitest';
import { createRegistry } from '../../src/core/registry.js';
import { createExecutionContext } from '../../src/core/context.js';
import { runWorkflow } from '../../src/core/workflow.js';
import { testGateNode } from '../../src/nodes/logic/test-gate.js';
import type { ExecService } from '../../src/nodes/logic/test-gate.js';
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

function mockExec(
  result: { exitCode: number; stdout: string; stderr: string },
  delay = 0
): ExecService {
  return vi.fn(async () => {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return result;
  });
}

function throwingExec(error: Error): ExecService {
  return vi.fn(async () => {
    throw error;
  });
}

async function runGate(
  exec: ExecService | undefined,
  input: { command: string; passNode?: string; failNode?: string; timeout?: number }
) {
  const registry = createRegistry();
  registry.register(testGateNode);
  registry.register(terminalNode('pass_branch'));
  registry.register(terminalNode('fail_branch'));

  const services: Record<string, unknown> = {};
  if (exec !== undefined) services.exec = exec;

  const ctx = createExecutionContext(services);

  const result = await runWorkflow(
    {
      verify: {
        nodeType: 'test-gate',
        input: {
          command: input.command,
          passNode: input.passNode ?? 'pass',
          failNode: input.failNode ?? 'fail',
          ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
        },
      },
      pass: { nodeType: 'pass_branch', input: {} },
      fail: { nodeType: 'fail_branch', input: {} },
    },
    'verify',
    registry,
    ctx
  );

  const gateResult = result.steps[0].result;
  const branchResult = result.steps[1]?.result;
  return {
    output: gateResult.output as {
      passed: boolean;
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
    },
    reachedBranch: branchResult
      ? (branchResult.output as { reached: string }).reached
      : undefined,
    workflowSuccess: result.success,
    gateSuccess: gateResult.success,
    gateError: gateResult.error,
  };
}

describe('testGateNode', () => {
  describe('branching', () => {
    it('branches to passNode on exit code 0', async () => {
      const exec = mockExec({ exitCode: 0, stdout: 'ok', stderr: '' });
      const r = await runGate(exec, { command: 'npm test' });
      expect(r.output.passed).toBe(true);
      expect(r.reachedBranch).toBe('pass_branch');
    });

    it('branches to failNode on non-zero exit code', async () => {
      const exec = mockExec({ exitCode: 1, stdout: '', stderr: 'FAIL' });
      const r = await runGate(exec, { command: 'npm test' });
      expect(r.output.passed).toBe(false);
      expect(r.reachedBranch).toBe('fail_branch');
    });

    it('branches to failNode on exit code other than 1', async () => {
      const exec = mockExec({ exitCode: 127, stdout: '', stderr: 'command not found' });
      const r = await runGate(exec, { command: 'nonexistent' });
      expect(r.output.passed).toBe(false);
      expect(r.output.exitCode).toBe(127);
      expect(r.reachedBranch).toBe('fail_branch');
    });
  });

  describe('output fields', () => {
    it('includes all output fields', async () => {
      const exec = mockExec({ exitCode: 0, stdout: 'all good', stderr: 'warn' });
      const r = await runGate(exec, { command: 'npm test' });
      expect(r.output).toMatchObject({
        passed: true,
        exitCode: 0,
        stdout: 'all good',
        stderr: 'warn',
      });
      expect(r.output.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof r.output.durationMs).toBe('number');
    });

    it('measures duration in milliseconds', async () => {
      const exec = mockExec({ exitCode: 0, stdout: '', stderr: '' }, 50);
      const r = await runGate(exec, { command: 'sleep' });
      expect(r.output.durationMs).toBeGreaterThanOrEqual(40);
    });
  });

  describe('exec service missing', () => {
    it('returns success: false when no exec service in context', async () => {
      const r = await runGate(undefined, { command: 'npm test' });
      expect(r.gateSuccess).toBe(false);
      expect(r.gateError).toMatch(/exec/i);
      expect(r.workflowSuccess).toBe(false);
    });
  });

  describe('exec throws', () => {
    it('branches to failNode when exec service throws', async () => {
      const exec = throwingExec(new Error('spawn ENOENT'));
      const r = await runGate(exec, { command: 'missing-binary' });
      expect(r.output.passed).toBe(false);
      expect(r.output.exitCode).toBe(-1);
      expect(r.output.stderr).toContain('spawn ENOENT');
      expect(r.reachedBranch).toBe('fail_branch');
      expect(r.gateSuccess).toBe(true);
    });
  });

  describe('command and timeout forwarding', () => {
    it('passes the command string to exec service', async () => {
      const exec = mockExec({ exitCode: 0, stdout: '', stderr: '' });
      await runGate(exec, { command: 'npm run lint' });
      expect(exec).toHaveBeenCalledWith('npm run lint', expect.any(Object));
    });

    it('passes timeout option to exec service', async () => {
      const exec = mockExec({ exitCode: 0, stdout: '', stderr: '' });
      await runGate(exec, { command: 'npm test', timeout: 5000 });
      expect(exec).toHaveBeenCalledWith('npm test', expect.objectContaining({ timeout: 5000 }));
    });

    it('passes undefined timeout when not provided', async () => {
      const exec = mockExec({ exitCode: 0, stdout: '', stderr: '' });
      await runGate(exec, { command: 'npm test' });
      expect(exec).toHaveBeenCalledWith('npm test', expect.objectContaining({ timeout: undefined }));
    });
  });

  describe('workflow integration', () => {
    it('output accessible via interpolation in downstream nodes', async () => {
      const exec = mockExec({ exitCode: 1, stdout: 'test output', stderr: 'error detail' });

      const echoNode = defineNode({
        type: 'echo',
        name: 'Echo',
        category: 'action',
        inputSchema: z.object({ message: z.string() }),
        outputSchema: z.object({ echoed: z.string() }),
        executor: async (input) => ({ success: true, output: { echoed: input.message } }),
      });

      const registry = createRegistry();
      registry.register(testGateNode);
      registry.register(echoNode);

      const ctx = createExecutionContext({ exec });

      const result = await runWorkflow(
        {
          verify: {
            nodeType: 'test-gate',
            input: { command: 'npm test', passNode: 'done', failNode: 'report' },
          },
          report: {
            nodeType: 'echo',
            input: { message: '{{verify.stderr}}' },
          },
          done: {
            nodeType: 'echo',
            input: { message: 'passed' },
          },
        },
        'verify',
        registry,
        ctx
      );

      expect(result.success).toBe(true);
      const reportOutput = result.steps[1].result.output as { echoed: string };
      expect(reportOutput.echoed).toBe('error detail');
    });

    it('works in a conditional retry loop', async () => {
      let callCount = 0;
      const flakyExec: ExecService = vi.fn(async () => {
        callCount++;
        if (callCount < 3) return { exitCode: 1, stdout: '', stderr: `attempt ${callCount} failed` };
        return { exitCode: 0, stdout: 'passed on attempt 3', stderr: '' };
      });

      const incrementNode = defineNode({
        type: 'increment',
        name: 'Increment',
        category: 'action',
        inputSchema: z.object({}).passthrough(),
        outputSchema: z.object({ count: z.number() }),
        executor: async (_input, ctx) => {
          const current = (ctx.get('_retryCount') as number) ?? 0;
          ctx.set('_retryCount', current + 1);
          return { success: true, output: { count: current + 1 }, nextNode: 'verify' };
        },
      });

      const registry = createRegistry();
      const { conditionalNode } = await import('../../src/nodes/logic/conditional.js');
      registry.register(testGateNode);
      registry.register(conditionalNode);
      registry.register(incrementNode);
      registry.register(terminalNode('done'));
      registry.register(terminalNode('exhausted'));

      const ctx = createExecutionContext({ exec: flakyExec }, { _retryCount: 0 });

      const result = await runWorkflow(
        {
          verify: {
            nodeType: 'test-gate',
            input: { command: 'npm test', passNode: 'done', failNode: 'check_retries' },
          },
          check_retries: {
            nodeType: 'conditional',
            input: {
              variable: '_retryCount',
              condition: 'less_than',
              value: 5,
              trueNode: 'retry',
              falseNode: 'exhausted',
            },
          },
          retry: { nodeType: 'increment', input: {} },
          done: { nodeType: 'done', input: {} },
          exhausted: { nodeType: 'exhausted', input: {} },
        },
        'verify',
        registry,
        ctx
      );

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
      const lastStep = result.steps[result.steps.length - 1];
      expect((lastStep.result.output as { reached: string }).reached).toBe('done');
    });
  });
});
