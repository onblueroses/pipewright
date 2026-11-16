import { z } from "zod";

// =============================================================================
// Social Keyword Generator
// =============================================================================

export const SocialKeywordGeneratorInputSchema = z
	.object({
		topic: z.string().describe("The topic to generate keywords for"),
		userKeywords: z
			.array(z.string())
			.optional()
			.describe("Optional seed keywords from the user"),
	})
	.describe("Input for generating platform-specific social media keywords");

export type SocialKeywordGeneratorInput = z.infer<
	typeof SocialKeywordGeneratorInputSchema
>;

export const SocialKeywordGeneratorOutputSchema = z
	.object({
		topic: z.string().describe("The topic keywords were generated for"),
		twitter: z.object({
			keywords: z.array(z.string()).describe("Twitter-optimized keywords"),
			searchQuery: z.string().describe("Combined search query for Twitter API"),
		}),
		reddit: z.object({
			keywords: z.array(z.string()).describe("Reddit-optimized keywords"),
		}),
		linkedin: z.object({
			keywords: z.array(z.string()).describe("LinkedIn-optimized keywords"),
			searchQueries: z.array(z.string()).describe("LinkedIn search queries"),
		}),
		allKeywords: z
			.array(z.string())
			.describe("Deduplicated union of all platform keywords"),
	})
	.describe("Platform-specific keyword sets for social media monitoring");

export type SocialKeywordGeneratorOutput = z.infer<
	typeof SocialKeywordGeneratorOutputSchema
>;

// =============================================================================
// Social AI Analyze
// =============================================================================

export const SocialPostSchema = z.object({
	id: z.string(),
	platform: z.enum(["twitter", "reddit", "linkedin"]),
	url: z.string(),
	text: z.string(),
	title: z.string().optional(),
	authorName: z.string(),
	authorHandle: z.string(),
	authorUrl: z.string(),
	authorFollowers: z.number().optional(),
	engagement: z.object({
		likes: z.number(),
		comments: z.number(),
		shares: z.number(),
		views: z.number().optional(),
	}),
	postedAt: z.string(),
});

export type SocialPost = z.infer<typeof SocialPostSchema>;

export const SocialAiAnalyzeInputSchema = z
	.object({
		twitterPosts: z
			.array(SocialPostSchema)
			.optional()
			.describe("Twitter posts to analyze"),
		redditPosts: z
			.array(SocialPostSchema)
			.optional()
			.describe("Reddit posts to analyze"),
		linkedinPosts: z
			.array(SocialPostSchema)
			.optional()
			.describe("LinkedIn posts to analyze"),
		posts: z
			.array(SocialPostSchema)
			.optional()
			.describe("Generic posts (any platform)"),
		topic: z.string().describe("The topic being monitored"),
		userIntent: z
			.string()
			.describe("What the user wants to learn from these posts"),
		monitoringConfigId: z
			.string()
			.optional()
			.describe("Link to monitoring configuration"),
	})
	.describe("Social posts for AI relevance analysis and prioritization");

export type SocialAiAnalyzeInput = z.infer<typeof SocialAiAnalyzeInputSchema>;

export const AnalyzedPostSchema = SocialPostSchema.extend({
	relevanceScore: z.number(),
	sentiment: z.enum(["positive", "negative", "neutral"]),
	isComplaint: z.boolean(),
	urgencyLevel: z.enum(["low", "medium", "high"]),
	aiSummary: z.string(),
	matchedKeywords: z.array(z.string()),
});

export type AnalyzedPost = z.infer<typeof AnalyzedPostSchema>;

export const SocialAiAnalyzeOutputSchema = z.object({
	analyzedPosts: z.array(AnalyzedPostSchema),
	highPriorityPosts: z.array(AnalyzedPostSchema),
	complaints: z.array(AnalyzedPostSchema),
	totalAnalyzed: z.number(),
	highPriorityCount: z.number(),
	complaintCount: z.number(),
	averageRelevance: z.number(),
});

export type SocialAiAnalyzeOutput = z.infer<typeof SocialAiAnalyzeOutputSchema>;
