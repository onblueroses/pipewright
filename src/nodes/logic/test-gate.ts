import { z } from 'zod';
import { defineNode } from '../../core/node.js';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeout?: number;
}

export type ExecService = (command: string, options?: ExecOptions) => Promise<ExecResult>;

const inputSchema = z.object({
  command: z.string(),
  passNode: z.string(),
  failNode: z.string(),
  timeout: z.number().int().positive().optional(),
});

const outputSchema = z.object({
  passed: z.boolean(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
});

export const testGateNode = defineNode({
  type: 'test-gate',
  name: 'Test Gate',
  description: 'Run a command and branch based on exit code: 0 passes, non-zero fails',
  category: 'logic',
  inputSchema,
  outputSchema,
  executor: async (input, context) => {
    const exec = context.services.exec as ExecService | undefined;
    if (!exec) {
      return {
        success: false,
        error: 'No exec service found in context.services. Register an ExecService before using test-gate.',
      };
    }

    const start = Date.now();
    try {
      const result = await exec(input.command, { timeout: input.timeout });
      const durationMs = Date.now() - start;
      const passed = result.exitCode === 0;
      return {
        success: true,
        output: {
          passed,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs,
        },
        nextNode: passed ? input.passNode : input.failNode,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: true,
        output: {
          passed: false,
          exitCode: -1,
          stdout: '',
          stderr: message,
          durationMs,
        },
        nextNode: input.failNode,
      };
    }
  },
});
