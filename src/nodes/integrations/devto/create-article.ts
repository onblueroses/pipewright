import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type DevtoApiArticle,
	type DevtoCreateArticleInput,
	DevtoCreateArticleInputSchema,
	DevtoCreateArticleOutputSchema,
	normalizeDevtoArticle,
} from "./schemas.js";

const DEVTO_API_BASE = "https://dev.to/api";

export const devtoCreateArticleNode = defineNode({
	type: "devto-create-article",
	name: "Dev.to Create Article",
	description: "Create a new article on Dev.to (defaults to draft)",
	category: "integration",
	inputSchema: DevtoCreateArticleInputSchema,
	outputSchema: DevtoCreateArticleOutputSchema,
	executor: async (input: DevtoCreateArticleInput, context) => {
		try {
			const apiKey = context.credentials?.devto?.apiKey;
			if (!apiKey) {
				return {
					success: false,
					error:
						"Dev.to API key not configured. Please provide context.credentials.devto.apiKey.",
				};
			}

			const articleBody: Record<string, unknown> = {
				title: input.title,
				body_markdown: input.bodyMarkdown,
				published: input.published ?? false,
			};
			if (input.tags !== undefined) articleBody.tags = input.tags;
			if (input.series !== undefined) articleBody.series = input.series;
			if (input.canonicalUrl !== undefined)
				articleBody.canonical_url = input.canonicalUrl;
			if (input.description !== undefined)
				articleBody.description = input.description;

			const response = await fetchWithRetry(`${DEVTO_API_BASE}/articles`, {
				method: "POST",
				headers: {
					"api-key": apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ article: articleBody }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `Dev.to API error ${response.status}: ${errorText}`,
				};
			}

			const data = (await response.json()) as DevtoApiArticle;

			return {
				success: true,
				output: normalizeDevtoArticle(data),
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},
});
