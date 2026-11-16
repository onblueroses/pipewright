import { z } from "zod";
import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Reddit search.json API response types
 */
interface RedditSearchResponse {
	kind: string;
	data: {
		after: string | null;
		children: Array<{
			kind: string;
			data: {
				id: string;
				permalink: string;
				selftext: string;
				title: string;
				author: string;
				subreddit: string;
				score: number;
				num_comments: number;
				num_crossposts?: number;
				upvote_ratio: number;
				created_utc: number;
			};
		}>;
	};
}

/**
 * Reddit post in unified social format
 */
export interface RedditPost {
	id: string;
	platform: "reddit";
	url: string;
	text: string;
	title: string;
	authorName: string;
	authorHandle: string;
	authorUrl: string;
	subreddit: string;
	engagement: {
		likes: number;
		comments: number;
		shares: number;
	};
	upvoteRatio: number;
	postedAt: string;
}

// =============================================================================
// Schemas
// =============================================================================

export const RedditMonitorInputSchema = z.object({
	/** Keywords to search for */
	keywords: z.array(z.string()),
	/** Time filter for search results */
	timeFilter: z
		.enum(["hour", "day", "week", "month", "year", "all"])
		.optional()
		.default("day"),
	/** Sort order for results */
	sortBy: z
		.enum(["relevance", "hot", "top", "new", "comments"])
		.optional()
		.default("new"),
	/** Maximum number of results to return */
	maxResults: z.number().optional().default(50),
});

export type RedditMonitorInput = z.infer<typeof RedditMonitorInputSchema>;

export const RedditMonitorOutputSchema = z.object({
	posts: z.array(
		z.object({
			id: z.string(),
			platform: z.literal("reddit"),
			url: z.string(),
			text: z.string(),
			title: z.string(),
			authorName: z.string(),
			authorHandle: z.string(),
			authorUrl: z.string(),
			subreddit: z.string(),
			engagement: z.object({
				likes: z.number(),
				comments: z.number(),
				shares: z.number(),
			}),
			upvoteRatio: z.number(),
			postedAt: z.string(),
		}),
	),
	totalFound: z.number(),
	subredditsSearched: z.array(z.string()),
});

export type RedditMonitorOutput = z.infer<typeof RedditMonitorOutputSchema>;

// =============================================================================
// Reddit API Helper
// =============================================================================

/**
 * Search Reddit using the public search.json endpoint.
 * No authentication required.
 */
async function searchReddit(
	query: string,
	options: {
		sort?: "relevance" | "hot" | "top" | "new" | "comments";
		time?: "hour" | "day" | "week" | "month" | "year" | "all";
		limit?: number;
	} = {},
): Promise<RedditSearchResponse> {
	const { sort = "new", time = "day", limit = 50 } = options;

	const params = new URLSearchParams({
		q: query,
		type: "link",
		sort,
		t: time,
		limit: String(Math.min(limit, 100)),
		restrict_sr: "off",
	});

	const url = `https://www.reddit.com/search.json?${params.toString()}`;

	const response = await fetchWithRetry(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (compatible; dag-automation-kit/0.1)",
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Reddit API error: ${response.status} - ${errorText}`);
	}

	return response.json() as Promise<RedditSearchResponse>;
}

// =============================================================================
// Node Definition
// =============================================================================

/**
 * Reddit Monitor Node
 *
 * Searches Reddit for posts matching keywords using the public search.json API.
 * No authentication required - uses public Reddit API.
 *
 * @example
 * ```typescript
 * const result = await redditMonitorNode.executor({
 *   keywords: ['typescript', 'nodejs'],
 *   timeFilter: 'week',
 *   maxResults: 25
 * }, context);
 * // Returns: { posts: [...], totalFound: 25, subredditsSearched: ['all'] }
 * ```
 */
export const redditMonitorNode = defineNode({
	type: "reddit-monitor",
	name: "Reddit Monitor",
	description:
		"Search Reddit for posts matching keywords across all subreddits",
	category: "integration",
	inputSchema: RedditMonitorInputSchema,
	outputSchema: RedditMonitorOutputSchema,

	executor: async (input, _context) => {
		try {
			const allPosts: RedditPost[] = [];

			// Build search query with proper quoting for multi-word keywords
			const query = input.keywords
				.map((k) => (k.includes(" ") ? `"${k}"` : k))
				.join(" OR ");

			const maxResults = Math.min(input.maxResults || 50, 100);

			// Search Reddit
			const response = await searchReddit(query, {
				sort: input.sortBy || "new",
				time: input.timeFilter || "day",
				limit: maxResults,
			});

			// Transform to unified format
			for (const post of response.data.children) {
				const submission = post.data;

				allPosts.push({
					id: submission.id,
					platform: "reddit",
					url: `https://reddit.com${submission.permalink}`,
					text: submission.selftext || "",
					title: submission.title,
					authorName: submission.author || "[deleted]",
					authorHandle: submission.author || "[deleted]",
					authorUrl:
						submission.author && submission.author !== "[deleted]"
							? `https://reddit.com/u/${submission.author}`
							: "",
					subreddit: submission.subreddit,
					engagement: {
						likes: submission.score,
						comments: submission.num_comments,
						shares: submission.num_crossposts || 0,
					},
					upvoteRatio: submission.upvote_ratio,
					postedAt: new Date(submission.created_utc * 1000).toISOString(),
				});
			}

			// Sort by recency
			allPosts.sort(
				(a, b) =>
					new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
			);

			return {
				success: true,
				output: {
					posts: allPosts,
					totalFound: allPosts.length,
					subredditsSearched: ["all"],
				},
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to monitor Reddit",
			};
		}
	},
});
