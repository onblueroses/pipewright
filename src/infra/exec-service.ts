import { exec } from "node:child_process";
import type { ExecOptions, ExecResult, ExecService } from "../core/types.js";

/**
 * An `ExecService` for `test-gate` built on `child_process.exec`. A command that
 * exits with a code resolves, also a non-zero code. A command that cannot start,
 * or that a timeout or signal stops, rejects, so the step fails.
 */
export function createExecService(shell?: string): ExecService {
	return (command: string, options?: ExecOptions): Promise<ExecResult> =>
		new Promise((resolve, reject) => {
			exec(
				command,
				{ timeout: options?.timeout, shell, maxBuffer: 10 * 1024 * 1024 },
				(error, stdout, stderr) => {
					const exitCode = error ? error.code : 0;
					if (typeof exitCode !== "number" || error?.killed) {
						reject(error ?? new Error(`Command "${command}" did not exit`));
						return;
					}
					resolve({ exitCode, stdout: String(stdout), stderr: String(stderr) });
				},
			);
		});
}
