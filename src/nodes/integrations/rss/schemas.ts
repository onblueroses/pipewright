import { z } from "zod";

export const RssFetchInputSchema = z.object({
	url: z.string().url(),
	maxItems: z.number().positive().default(50),
});

export type RssFetchInput = z.infer<typeof RssFetchInputSchema>;

const RssItemSchema = z.object({
	title: z.string(),
	link: z.string(),
	pubDate: z.string().optional(),
	description: z.string().optional(),
	guid: z.string().optional(),
});

export const RssFetchOutputSchema = z.object({
	items: z.array(RssItemSchema),
	feedTitle: z.string().optional(),
});

export type RssFetchOutput = z.infer<typeof RssFetchOutputSchema>;
