import { defineNode } from "../../core/node.js";
import { generateText } from "../../utils/anthropic.js";
import { sanitizeLlmJson } from "../../utils/sanitize-llm-json.js";
import { buildKeywordPrompt } from "./prompts/keyword-generator.js";
import {
	SocialKeywordGeneratorInputSchema,
	type SocialKeywordGeneratorOutput,
	SocialKeywordGeneratorOutputSchema,
} from "./schemas.js";

// Re-export schemas for convenience
export {
	type SocialKeywordGeneratorInput,
	SocialKeywordGeneratorInputSchema,
	type SocialKeywordGeneratorOutput,
	SocialKeywordGeneratorOutputSchema,
} from "./schemas.js";

/**
 * Social Keyword Generator Node
 *
 * Uses Claude to generate platform-specific search keywords from a user's
 * natural language topic description. Outputs ready-to-use search queries
 * for Twitter, Reddit, and LinkedIn.
 *
 * Requires `context.credentials.anthropic.apiKey` to be provided.
 *
 * @example
 * ```typescript
 * const result = await socialKeywordGeneratorNode.executor({
 *   topic: 'People frustrated with project management tools',
 *   userKeywords: ['asana', 'monday.com']
 * }, context);
 * ```
 */
export const socialKeywordGeneratorNode = defineNode({
	type: "social-keyword-generator",
	name: "Social Keyword Generator",
	description:
		"Generate platform-specific search keywords using AI for social monitoring",
	category: "action",
	inputSchema: SocialKeywordGeneratorInputSchema,
	outputSchema: SocialKeywordGeneratorOutputSchema,

	executor: async (input, context) => {
		try {
			// Check for API key
			const apiKey = context.credentials?.anthropic?.apiKey;
			if (!apiKey) {
				return {
					success: false,
					error:
						"Anthropic API key not configured. Please provide context.credentials.anthropic.apiKey.",
				};
			}

			// Build prompt using helper
			const prompt = buildKeywordPrompt(input.topic, input.userKeywords);

			// Call Claude to generate keywords
			const responseText = await generateText(apiKey, prompt, {
				maxTokens: 16000,
			});

			// Parse JSON from response
			const jsonMatch = responseText.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				return { success: false, error: "Could not parse keyword response" };
			}

			let parsed: {
				twitter: { keywords: string[]; searchQuery: string };
				reddit: { keywords: string[] };
				linkedin: { keywords: string[]; searchQueries: string[] };
			};

			try {
				parsed = JSON.parse(sanitizeLlmJson(jsonMatch[0]));
			} catch {
				return {
					success: false,
					error: "Failed to parse keyword JSON response",
				};
			}

			// Merge user keywords into generated keywords (deduplicated)
			const mergedTwitterKeywords = [
				...new Set([...parsed.twitter.keywords, ...(input.userKeywords || [])]),
			];

			const mergedRedditKeywords = [
				...new Set([...parsed.reddit.keywords, ...(input.userKeywords || [])]),
			];

			const mergedLinkedInKeywords = [
				...new Set([
					...parsed.linkedin.keywords,
					...(input.userKeywords || []),
				]),
			];

			// Collect all unique keywords
			const allKeywords = [
				...new Set([
					...mergedTwitterKeywords,
					...mergedRedditKeywords,
					...mergedLinkedInKeywords,
				]),
			];

			const output: SocialKeywordGeneratorOutput = {
				topic: input.topic,
				twitter: {
					keywords: mergedTwitterKeywords,
					searchQuery: parsed.twitter.searchQuery,
				},
				reddit: {
					keywords: mergedRedditKeywords,
				},
				linkedin: {
					keywords: mergedLinkedInKeywords,
					searchQueries: parsed.linkedin.searchQueries,
				},
				allKeywords,
			};

			return {
				success: true,
				output,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to generate keywords",
			};
		}
	},
});
