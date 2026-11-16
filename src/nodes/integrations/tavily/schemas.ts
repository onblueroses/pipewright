import { z } from "zod";

export const TavilySearchInputSchema = z.object({
	query: z.string(),
	maxResults: z.number().min(1).max(20).default(5),
	searchDepth: z.enum(["basic", "advanced"]).default("basic"),
});

export type TavilySearchInput = z.infer<typeof TavilySearchInputSchema>;

const TavilyResultSchema = z.object({
	title: z.string(),
	url: z.string(),
	content: z.string(),
	score: z.number(),
});

export const TavilySearchOutputSchema = z.object({
	results: z.array(TavilyResultSchema),
});

export type TavilySearchOutput = z.infer<typeof TavilySearchOutputSchema>;
