import { exec as execCb } from 'node:child_process';
import type { ExecService, ExecResult, ExecOptions } from 'pipewright';

export function createExecService(shell?: string): ExecService {
  return async (command: string, options?: ExecOptions): Promise<ExecResult> => {
    const timeout = options?.timeout ?? 30_000;

    return new Promise((resolve) => {
      const child = execCb(
        command,
        { timeout, shell, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({
            exitCode: error ? (child.exitCode ?? 1) : 0,
            stdout: stdout.toString(),
            stderr: stderr.toString(),
          });
        }
      );
    });
  };
}

declare module 'pipewright' {
  interface NodeServices {
    exec?: ExecService;
  }
}
