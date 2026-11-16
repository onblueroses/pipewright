import { z } from "zod";

export const GitOperationsInputSchema = z.object({
	repoPath: z.string(),
	operation: z.enum(["add", "commit", "push", "pull", "status"]),
	files: z.array(z.string()).optional(),
	message: z.string().optional(),
	remote: z.string().default("origin"),
	branch: z.string().optional(),
});

export type GitOperationsInput = z.infer<typeof GitOperationsInputSchema>;

export const GitOperationsOutputSchema = z.object({
	result: z.string(),
	exitCode: z.number(),
});

export type GitOperationsOutput = z.infer<typeof GitOperationsOutputSchema>;
