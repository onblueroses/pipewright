import { z } from "zod";

export const SqliteQueryInputSchema = z.object({
	dbPath: z.string(),
	query: z.string(),
	params: z.array(z.unknown()).default([]),
	mode: z.enum(["all", "run", "get"]).default("all"),
});

export type SqliteQueryInput = z.infer<typeof SqliteQueryInputSchema>;

export const SqliteQueryOutputSchema = z.object({
	rows: z.array(z.record(z.string(), z.unknown())).optional(),
	changes: z.number().optional(),
	lastInsertRowid: z.number().optional(),
});

export type SqliteQueryOutput = z.infer<typeof SqliteQueryOutputSchema>;
