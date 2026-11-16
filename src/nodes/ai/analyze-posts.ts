import { defineNode } from "../../core/node.js";
import { generateText } from "../../utils/anthropic.js";
import { sanitizeLlmJson } from "../../utils/sanitize-llm-json.js";
import {
	ANALYSIS_BATCH_SIZE,
	buildAnalysisPrompt,
	MIN_RELEVANCE_SCORE,
	normalizeSentiment,
	normalizeUrgency,
} from "./prompts/analyze-posts.js";
import {
	type AnalyzedPost,
	SocialAiAnalyzeInputSchema,
	SocialAiAnalyzeOutputSchema,
	type SocialPost,
} from "./schemas.js";

// Re-export schemas and types for convenience
export {
	type AnalyzedPost,
	type SocialAiAnalyzeInput,
	SocialAiAnalyzeInputSchema,
	type SocialAiAnalyzeOutput,
	SocialAiAnalyzeOutputSchema,
	type SocialPost,
} from "./schemas.js";

/**
 * Social AI Analyze Node
 *
 * Uses Claude to analyze social media posts for relevance, sentiment,
 * complaint detection, and urgency. Batches posts to stay within context limits.
 *
 * Requires `context.credentials.anthropic.apiKey` to be provided.
 *
 * Note: This node analyzes posts but does NOT store results.
 * Storage is the responsibility of the host application.
 *
 * @example
 * ```typescript
 * const result = await socialAiAnalyzeNode.executor({
 *   twitterPosts: [...],
 *   redditPosts: [...],
 *   topic: 'Project management software',
 *   userIntent: 'Find people frustrated with current tools'
 * }, context);
 * ```
 */
export const socialAiAnalyzeNode = defineNode({
	type: "social-ai-analyze",
	name: "Social AI Analyze",
	description:
		"Analyze social media posts for relevance, sentiment, and urgency using AI",
	category: "action",
	inputSchema: SocialAiAnalyzeInputSchema,
	outputSchema: SocialAiAnalyzeOutputSchema,

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

			// Combine posts from all platforms
			const allPosts: SocialPost[] = [
				...(input.twitterPosts || []),
				...(input.redditPosts || []),
				...(input.linkedinPosts || []),
				...(input.posts || []),
			];

			if (allPosts.length === 0) {
				return {
					success: true,
					output: {
						analyzedPosts: [],
						highPriorityPosts: [],
						complaints: [],
						totalAnalyzed: 0,
						highPriorityCount: 0,
						complaintCount: 0,
						averageRelevance: 0,
					},
				};
			}

			const allAnalyzedPosts: AnalyzedPost[] = [];

			for (let i = 0; i < allPosts.length; i += ANALYSIS_BATCH_SIZE) {
				const batch = allPosts.slice(i, i + ANALYSIS_BATCH_SIZE);

				const prompt = buildAnalysisPrompt(
					input.topic,
					input.userIntent,
					batch,
				);

				const responseText = await generateText(apiKey, prompt, {
					maxTokens: 16000,
				});

				const jsonMatch = responseText.match(/\[[\s\S]*\]/);
				if (!jsonMatch) {
					return {
						success: false,
						error: `Batch ${i / ANALYSIS_BATCH_SIZE + 1}: the model reply has no JSON array`,
					};
				}

				try {
					const analyzed = JSON.parse(sanitizeLlmJson(jsonMatch[0])) as Array<{
						id: string;
						relevanceScore: number;
						sentiment: string;
						isComplaint: boolean;
						urgencyLevel: string;
						aiSummary: string;
						matchedKeywords: string[];
					}>;

					for (const analysis of analyzed) {
						const originalPost = batch.find((p) => p.id === analysis.id);
						if (
							originalPost &&
							analysis.relevanceScore >= MIN_RELEVANCE_SCORE
						) {
							allAnalyzedPosts.push({
								...originalPost,
								relevanceScore: analysis.relevanceScore,
								sentiment: normalizeSentiment(analysis.sentiment),
								isComplaint: Boolean(analysis.isComplaint),
								urgencyLevel: normalizeUrgency(analysis.urgencyLevel),
								aiSummary: analysis.aiSummary || "",
								matchedKeywords: analysis.matchedKeywords || [],
							});
						}
					}
				} catch (err) {
					return {
						success: false,
						error: `Batch ${i / ANALYSIS_BATCH_SIZE + 1}: could not parse the model reply: ${(err as Error).message}`,
					};
				}
			}

			// Sort by relevance (highest first)
			allAnalyzedPosts.sort((a, b) => b.relevanceScore - a.relevanceScore);

			// Filter high priority and complaints
			const highPriorityPosts = allAnalyzedPosts.filter(
				(p) => p.urgencyLevel === "high" || p.relevanceScore >= 80,
			);
			const complaints = allAnalyzedPosts.filter((p) => p.isComplaint);

			// Calculate average relevance
			const averageRelevance =
				allAnalyzedPosts.length > 0
					? Math.round(
							allAnalyzedPosts.reduce((sum, p) => sum + p.relevanceScore, 0) /
								allAnalyzedPosts.length,
						)
					: 0;

			return {
				success: true,
				output: {
					analyzedPosts: allAnalyzedPosts,
					highPriorityPosts,
					complaints,
					totalAnalyzed: allAnalyzedPosts.length,
					highPriorityCount: highPriorityPosts.length,
					complaintCount: complaints.length,
					averageRelevance,
				},
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to analyze posts",
			};
		}
	},
});
