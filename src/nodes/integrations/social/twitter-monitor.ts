import { z } from "zod";
import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";

// =============================================================================
// Constants
// =============================================================================

const TWITTERAPI_BASE_URL = "https://api.twitterapi.io";

// =============================================================================
// Types
// =============================================================================

/**
 * TwitterAPI.io tweet response format
 */
interface TwitterApiTweet {
	id: string;
	url: string;
	text: string;
	source: string;
	retweetCount: number;
	replyCount: number;
	likeCount: number;
	quoteCount: number;
	viewCount: number;
	createdAt: string;
	lang: string;
	bookmarkCount: number;
	isReply: boolean;
	author: {
		id: string;
		userName: string;
		name: string;
		profileImageUrl: string;
		followers: number;
		following: number;
		isVerified: boolean;
	};
	entities: {
		hashtags: string[];
		mentions: { userName: string; id: string }[];
		urls: { url: string; expandedUrl: string }[];
	};
}

interface TwitterApiSearchResponse {
	tweets: TwitterApiTweet[];
	has_next_page: boolean;
	next_cursor: string;
}

/**
 * Twitter/X post in unified social format
 */
export interface TwitterPost {
	id: string;
	platform: "twitter";
	url: string;
	text: string;
	authorName: string;
	authorHandle: string;
	authorUrl: string;
	authorFollowers: number;
	engagement: {
		likes: number;
		comments: number;
		shares: number;
		views: number;
	};
	postedAt: string;
}

// =============================================================================
// Schemas
// =============================================================================

export const TwitterMonitorInputSchema = z.object({
	/** Keywords to search for */
	keywords: z.array(z.string()),
	/** Exclude retweets from results */
	excludeRetweets: z.boolean().optional().default(true),
	/** Minimum likes filter */
	minLikes: z.number().optional(),
	/** Maximum number of results */
	maxResults: z.number().optional().default(50),
	/** Language filter (e.g., 'en') */
	lang: z.string().optional(),
	/** Search tweets from last N days */
	sinceDays: z.number().optional(),
});

export type TwitterMonitorInput = z.infer<typeof TwitterMonitorInputSchema>;

export const TwitterMonitorOutputSchema = z.object({
	posts: z.array(
		z.object({
			id: z.string(),
			platform: z.literal("twitter"),
			url: z.string(),
			text: z.string(),
			authorName: z.string(),
			authorHandle: z.string(),
			authorUrl: z.string(),
			authorFollowers: z.number(),
			engagement: z.object({
				likes: z.number(),
				comments: z.number(),
				shares: z.number(),
				views: z.number(),
			}),
			postedAt: z.string(),
		}),
	),
	totalFound: z.number(),
	hasMore: z.boolean(),
	cursor: z.string().optional(),
});

export type TwitterMonitorOutput = z.infer<typeof TwitterMonitorOutputSchema>;

// =============================================================================
// Query Builder
// =============================================================================

/**
 * Build Twitter search query with proper syntax
 */
function buildTwitterSearchQuery(
	keywords: string[],
	options: {
		excludeRetweets?: boolean;
		minLikes?: number;
		since?: string;
		lang?: string;
	} = {},
): string {
	// Join keywords with OR
	const keywordQuery = keywords
		.map((k) => (k.includes(" ") ? `"${k}"` : k))
		.join(" OR ");

	let query = `(${keywordQuery})`;

	if (options.excludeRetweets) {
		query += " -is:retweet";
	}

	if (options.minLikes) {
		query += ` min_faves:${options.minLikes}`;
	}

	if (options.since) {
		query += ` since:${options.since}`;
	}

	if (options.lang) {
		query += ` lang:${options.lang}`;
	}

	return query;
}

/**
 * Search Twitter using TwitterAPI.io
 */
async function searchTwitter(
	apiKey: string,
	query: string,
	queryType: "Latest" | "Top" = "Latest",
): Promise<TwitterApiSearchResponse> {
	const url = new URL(`${TWITTERAPI_BASE_URL}/twitter/tweet/advanced_search`);
	url.searchParams.set("query", query);
	url.searchParams.set("queryType", queryType);

	const response = await fetchWithRetry(url.toString(), {
		method: "GET",
		headers: {
			"X-API-Key": apiKey,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
	}

	return response.json() as Promise<TwitterApiSearchResponse>;
}

// =============================================================================
// Node Definition
// =============================================================================

/**
 * Twitter Monitor Node
 *
 * Searches Twitter/X for posts matching keywords using TwitterAPI.io.
 * Requires `context.credentials.twitter.twitterApiIoKey` to be provided.
 *
 * @example
 * ```typescript
 * const result = await twitterMonitorNode.executor({
 *   keywords: ['typescript', 'nodejs'],
 *   excludeRetweets: true,
 *   maxResults: 25,
 *   sinceDays: 7
 * }, context);
 * ```
 */
export const twitterMonitorNode = defineNode({
	type: "twitter-monitor",
	name: "Twitter Monitor",
	description: "Search Twitter/X for posts matching keywords",
	category: "integration",
	inputSchema: TwitterMonitorInputSchema,
	outputSchema: TwitterMonitorOutputSchema,

	executor: async (input, context) => {
		try {
			if (!input.keywords || input.keywords.length === 0) {
				return {
					success: false,
					error: "No keywords provided for Twitter search",
				};
			}

			// Check for API key (prefer TwitterAPI.io key)
			const apiKey = context.credentials?.twitter?.twitterApiIoKey;
			if (!apiKey) {
				return {
					success: false,
					error:
						"Twitter API key not configured. Please provide context.credentials.twitter.twitterApiIoKey.",
				};
			}

			// Build the search query
			const sinceDate = input.sinceDays
				? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
						.toISOString()
						.split("T")[0]
				: undefined;

			const query = buildTwitterSearchQuery(input.keywords, {
				excludeRetweets: input.excludeRetweets ?? true,
				minLikes: input.minLikes,
				since: sinceDate,
				lang: input.lang,
			});

			// Search tweets
			const response = await searchTwitter(apiKey, query, "Latest");

			// Transform to unified format
			const posts: TwitterPost[] = (response.tweets || [])
				.slice(0, input.maxResults || 50)
				.map((tweet) => ({
					id: tweet.id,
					platform: "twitter" as const,
					url: tweet.url,
					text: tweet.text,
					authorName: tweet.author.name,
					authorHandle: tweet.author.userName,
					authorUrl: `https://twitter.com/${tweet.author.userName}`,
					authorFollowers: tweet.author.followers,
					engagement: {
						likes: tweet.likeCount,
						comments: tweet.replyCount,
						shares: tweet.retweetCount,
						views: tweet.viewCount || 0,
					},
					postedAt: tweet.createdAt,
				}));

			return {
				success: true,
				output: {
					posts,
					totalFound: posts.length,
					hasMore: response.has_next_page,
					cursor: response.next_cursor || undefined,
				},
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to monitor Twitter",
			};
		}
	},
});
