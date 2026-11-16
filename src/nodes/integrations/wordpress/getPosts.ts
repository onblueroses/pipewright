import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	normalizeWordPressPost,
	type WordPressApiPost,
	type WordPressGetPostsInput,
	WordPressGetPostsInputSchema,
	WordPressGetPostsOutputSchema,
} from "./schemas.js";
import { resolveWordPressAuth } from "./utils.js";

const DEFAULT_PER_PAGE = 10;

export const wordpressGetPostsNode = defineNode({
	type: "wordpress-get-posts",
	name: "WordPress Get Posts",
	description: "Retrieve posts from a WordPress site",
	category: "integration",
	inputSchema: WordPressGetPostsInputSchema,
	outputSchema: WordPressGetPostsOutputSchema,
	executor: async (input: WordPressGetPostsInput, context) => {
		try {
			const authResult = resolveWordPressAuth(context.credentials?.wordpress);
			if ("error" in authResult) {
				return { success: false, error: authResult.error };
			}
			const { baseUrl, authHeader } = authResult;

			const perPage = input.perPage ?? DEFAULT_PER_PAGE;
			const page = input.page ?? 1;

			const params = new URLSearchParams({
				per_page: String(perPage),
				page: String(page),
			});
			if (input.status !== undefined) params.set("status", input.status);
			if (input.search !== undefined) params.set("search", input.search);

			const response = await fetchWithRetry(
				`${baseUrl}/wp-json/wp/v2/posts?${params.toString()}`,
				{
					method: "GET",
					headers: {
						Authorization: authHeader,
					},
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `WordPress API error ${response.status}: ${errorText}`,
				};
			}

			const totalFound = parseInt(
				response.headers.get("X-WP-Total") ?? "0",
				10,
			);
			const data = (await response.json()) as WordPressApiPost[];
			const posts = data.map(normalizeWordPressPost);

			return {
				success: true,
				output: {
					posts,
					meta: {
						totalFound: Number.isNaN(totalFound) ? 0 : totalFound,
						limit: perPage,
						offset: (page - 1) * perPage,
					},
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},
});
