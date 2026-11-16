import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type TavilySearchInput,
	TavilySearchInputSchema,
	TavilySearchOutputSchema,
} from "./schemas.js";

export const tavilySearchNode = defineNode({
	type: "tavily-search",
	name: "Tavily Search",
	category: "integration",
	inputSchema: TavilySearchInputSchema,
	outputSchema: TavilySearchOutputSchema,
	executor: async (input: TavilySearchInput, context) => {
		const apiKey = (context.credentials?.tavily as { apiKey?: string })?.apiKey;
		if (!apiKey) return { success: false, error: "Missing Tavily API key" };

		const response = await fetchWithRetry("https://api.tavily.com/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: apiKey,
				query: input.query,
				max_results: input.maxResults,
				search_depth: input.searchDepth,
			}),
		});

		const data = (await response.json()) as {
			results?: Array<{
				title: string;
				url: string;
				content: string;
				score: number;
			}>;
		};

		return {
			success: true,
			output: {
				results: (data.results ?? []).map((r) => ({
					title: r.title,
					url: r.url,
					content: r.content,
					score: r.score,
				})),
			},
		};
	},
});
