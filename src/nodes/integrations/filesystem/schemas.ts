import { z } from "zod";

export const FileReadInputSchema = z.object({
	path: z.string().startsWith("/"),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;

export const FileReadOutputSchema = z.object({
	content: z.string(),
	size: z.number(),
});

export type FileReadOutput = z.infer<typeof FileReadOutputSchema>;

export const FileWriteInputSchema = z.object({
	path: z.string().startsWith("/"),
	content: z.string(),
	append: z.boolean().default(false),
});

export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

export const FileWriteOutputSchema = z.object({
	path: z.string(),
	bytesWritten: z.number(),
});

export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;
