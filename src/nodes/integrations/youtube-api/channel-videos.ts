import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type YoutubeChannelVideosInput,
	YoutubeChannelVideosInputSchema,
	YoutubeChannelVideosOutputSchema,
} from "./schemas.js";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export const youtubeChannelVideosNode = defineNode({
	type: "youtube-channel-videos",
	name: "YouTube Channel Videos",
	category: "integration",
	inputSchema: YoutubeChannelVideosInputSchema,
	outputSchema: YoutubeChannelVideosOutputSchema,
	executor: async (input: YoutubeChannelVideosInput, context) => {
		const apiKey = (context.credentials?.youtube as { apiKey?: string })
			?.apiKey;
		if (!apiKey) return { success: false, error: "Missing YouTube API key" };

		const params = new URLSearchParams({
			part: "snippet",
			channelId: input.channelId,
			type: "video",
			order: "date",
			maxResults: String(input.maxResults),
			key: apiKey,
		});
		if (input.publishedAfter)
			params.set("publishedAfter", input.publishedAfter);

		const response = await fetchWithRetry(
			`${YOUTUBE_API_BASE}/search?${params}`,
			{},
		);

		const data = (await response.json()) as {
			items?: Array<{
				id: { videoId?: string };
				snippet: {
					title: string;
					channelId: string;
					channelTitle: string;
					publishedAt: string;
					thumbnails?: { default?: { url: string } };
					description?: string;
				};
			}>;
		};

		const videos = (data.items ?? []).map((item) => ({
			videoId: item.id.videoId ?? "",
			title: item.snippet.title,
			channelId: item.snippet.channelId,
			channelTitle: item.snippet.channelTitle,
			publishedAt: item.snippet.publishedAt,
			thumbnailUrl: item.snippet.thumbnails?.default?.url,
			description: item.snippet.description,
		}));

		return { success: true, output: { videos } };
	},
});
