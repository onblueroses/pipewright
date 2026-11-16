import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { defineNode } from "../../../core/node.js";
import {
	type FileReadInput,
	FileReadInputSchema,
	FileReadOutputSchema,
} from "./schemas.js";

export const fileReadNode = defineNode({
	type: "file-read",
	name: "File Read",
	category: "action",
	inputSchema: FileReadInputSchema,
	outputSchema: FileReadOutputSchema,
	executor: async (input: FileReadInput) => {
		const resolved = path.resolve(input.path);
		// Reject path traversal: resolved path must match the input
		if (resolved !== input.path) {
			return {
				success: false,
				error: `Path traversal rejected: ${input.path}`,
			};
		}

		const content = await readFile(resolved, "utf-8");
		const stats = await stat(resolved);

		return {
			success: true,
			output: { content, size: stats.size },
		};
	},
});
