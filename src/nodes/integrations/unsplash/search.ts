import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type UnsplashSearchInput,
	UnsplashSearchInputSchema,
	UnsplashSearchOutputSchema,
} from "./schemas.js";

export const unsplashSearchNode = defineNode({
	type: "unsplash-search",
	name: "Unsplash Search",
	category: "integration",
	inputSchema: UnsplashSearchInputSchema,
	outputSchema: UnsplashSearchOutputSchema,
	executor: async (input: UnsplashSearchInput, context) => {
		const accessKey = (context.credentials?.unsplash as { accessKey?: string })
			?.accessKey;
		if (!accessKey)
			return { success: false, error: "Missing Unsplash access key" };

		const params = new URLSearchParams({
			query: input.query,
			per_page: String(input.count),
		});
		if (input.orientation) params.set("orientation", input.orientation);

		const response = await fetchWithRetry(
			`https://api.unsplash.com/search/photos?${params}`,
			{
				headers: { Authorization: `Client-ID ${accessKey}` },
			},
		);

		const data = (await response.json()) as {
			results?: Array<{
				id: string;
				urls: { regular: string; thumb: string };
				alt_description?: string;
				width: number;
				height: number;
				user: { name: string };
			}>;
		};

		return {
			success: true,
			output: {
				photos: (data.results ?? []).map((p) => ({
					id: p.id,
					url: p.urls.regular,
					thumbUrl: p.urls.thumb,
					altDescription: p.alt_description,
					width: p.width,
					height: p.height,
					photographer: p.user.name,
				})),
			},
		};
	},
});
