import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineNode } from "../../../core/node.js";
import {
	type FileWriteInput,
	FileWriteInputSchema,
	FileWriteOutputSchema,
} from "./schemas.js";

export const fileWriteNode = defineNode({
	type: "file-write",
	name: "File Write",
	category: "action",
	inputSchema: FileWriteInputSchema,
	outputSchema: FileWriteOutputSchema,
	executor: async (input: FileWriteInput) => {
		const resolved = path.resolve(input.path);
		if (resolved !== input.path) {
			return {
				success: false,
				error: `Path traversal rejected: ${input.path}`,
			};
		}

		await mkdir(path.dirname(resolved), { recursive: true });

		if (input.append) {
			await appendFile(resolved, input.content, "utf-8");
		} else {
			await writeFile(resolved, input.content, "utf-8");
		}

		const bytes = Buffer.byteLength(input.content, "utf-8");
		return {
			success: true,
			output: { path: resolved, bytesWritten: bytes },
		};
	},
});
