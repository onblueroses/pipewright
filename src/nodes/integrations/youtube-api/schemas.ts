import { z } from "zod";

const VideoItemSchema = z.object({
	videoId: z.string(),
	title: z.string(),
	channelId: z.string(),
	channelTitle: z.string(),
	publishedAt: z.string(),
	thumbnailUrl: z.string().optional(),
	description: z.string().optional(),
});

export const YoutubeSearchInputSchema = z.object({
	query: z.string(),
	maxResults: z.number().min(1).max(50).default(10),
	publishedAfter: z.string().optional(),
	type: z.enum(["video", "channel", "playlist"]).default("video"),
});

export type YoutubeSearchInput = z.infer<typeof YoutubeSearchInputSchema>;

export const YoutubeSearchOutputSchema = z.object({
	videos: z.array(VideoItemSchema),
});

export type YoutubeSearchOutput = z.infer<typeof YoutubeSearchOutputSchema>;

export const YoutubeChannelVideosInputSchema = z.object({
	channelId: z.string(),
	maxResults: z.number().min(1).max(50).default(10),
	publishedAfter: z.string().optional(),
});

export type YoutubeChannelVideosInput = z.infer<
	typeof YoutubeChannelVideosInputSchema
>;

export const YoutubeChannelVideosOutputSchema = z.object({
	videos: z.array(VideoItemSchema),
});

export type YoutubeChannelVideosOutput = z.infer<
	typeof YoutubeChannelVideosOutputSchema
>;
