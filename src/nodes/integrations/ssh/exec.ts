import { spawn } from "node:child_process";
import { defineNode } from "../../../core/node.js";
import type { NodeResult } from "../../../core/types.js";
import {
	type SshExecInput,
	SshExecInputSchema,
	type SshExecOutput,
	SshExecOutputSchema,
} from "./schemas.js";

export const sshExecNode = defineNode({
	type: "ssh-exec",
	name: "SSH Execute",
	category: "integration",
	inputSchema: SshExecInputSchema,
	outputSchema: SshExecOutputSchema,
	executor: async (input: SshExecInput) => {
		return new Promise<NodeResult<SshExecOutput>>((resolve) => {
			const args = [
				"-o",
				"StrictHostKeyChecking=no",
				"-o",
				"BatchMode=yes",
				...(input.timeoutMs
					? ["-o", `ConnectTimeout=${Math.ceil(input.timeoutMs / 1000)}`]
					: []),
				"-p",
				String(input.port),
			];

			if (input.privateKeyPath) {
				args.push("-i", input.privateKeyPath);
			}

			args.push(`${input.user}@${input.host}`, input.command);

			const proc = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});

			const timer =
				input.timeoutMs === undefined
					? undefined
					: setTimeout(() => {
							proc.kill("SIGTERM");
							resolve({
								success: false,
								error: `SSH command timed out after ${input.timeoutMs}ms`,
							});
						}, input.timeoutMs);

			proc.on("close", (code) => {
				clearTimeout(timer);
				resolve({
					success: true,
					output: {
						stdout: stdout.trim(),
						stderr: stderr.trim(),
						exitCode: code ?? 1,
					},
				});
			});

			proc.on("error", (err) => {
				clearTimeout(timer);
				resolve({ success: false, error: `SSH spawn error: ${err.message}` });
			});
		});
	},
});
