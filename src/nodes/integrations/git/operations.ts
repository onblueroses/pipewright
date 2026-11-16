import { execFile } from "node:child_process";
import { defineNode } from "../../../core/node.js";
import {
	type GitOperationsInput,
	GitOperationsInputSchema,
	GitOperationsOutputSchema,
} from "./schemas.js";

function runGit(
	args: string[],
	cwd: string,
): Promise<{ stdout: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd }, (error, stdout, stderr) => {
			if (error?.killed) {
				reject(new Error("Git command was killed"));
				return;
			}
			resolve({
				stdout: (stdout ?? "").trim() + (stderr ? `\n${stderr.trim()}` : ""),
				exitCode: error?.code ? Number(error.code) : 0,
			});
		});
	});
}

export const gitOperationsNode = defineNode({
	type: "git-operations",
	name: "Git Operations",
	category: "action",
	inputSchema: GitOperationsInputSchema,
	outputSchema: GitOperationsOutputSchema,
	executor: async (input: GitOperationsInput) => {
		let args: string[];

		switch (input.operation) {
			case "add":
				args = ["add", ...(input.files ?? ["."])];
				break;
			case "commit":
				args = ["commit", "-m", input.message ?? "automated commit"];
				break;
			case "push":
				args = ["push", input.remote, ...(input.branch ? [input.branch] : [])];
				break;
			case "pull":
				args = ["pull", input.remote, ...(input.branch ? [input.branch] : [])];
				break;
			case "status":
				args = ["status", "--short"];
				break;
		}

		const result = await runGit(args, input.repoPath);
		return {
			success: true,
			output: { result: result.stdout, exitCode: result.exitCode },
		};
	},
});
