import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import { rssFetchNode } from "../../src/nodes/integrations/rss/index.js";
import { tavilySearchNode } from "../../src/nodes/integrations/tavily/index.js";
import { unsplashSearchNode } from "../../src/nodes/integrations/unsplash/index.js";
import {
	youtubeChannelVideosNode,
	youtubeSearchNode,
} from "../../src/nodes/integrations/youtube-api/index.js";

describe("data-fetching nodes", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("youtube-search", () => {
		it("searches videos and returns structured results", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({
					items: [
						{
							id: { videoId: "abc123" },
							snippet: {
								title: "Test Video",
								channelId: "ch1",
								channelTitle: "Test Channel",
								publishedAt: "2026-01-01T00:00:00Z",
								thumbnails: {
									default: { url: "https://img.youtube.com/thumb.jpg" },
								},
								description: "A test video",
							},
						},
					],
				}),
				text: async () => "{}",
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(youtubeSearchNode);
			const ctx = createExecutionContext(
				{},
				{},
				{ youtube: { apiKey: "yt-key" } },
			);

			const result = await registry.execute(
				"youtube-search",
				{
					query: "test query",
					maxResults: 5,
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.videos).toHaveLength(1);
			expect(result.output?.videos[0]).toEqual(
				expect.objectContaining({
					videoId: "abc123",
					title: "Test Video",
					channelTitle: "Test Channel",
				}),
			);
		});
	});

	describe("youtube-channel-videos", () => {
		it("fetches channel videos", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({
					items: [
						{
							id: { videoId: "vid1" },
							snippet: {
								title: "Channel Video",
								channelId: "ch1",
								channelTitle: "My Channel",
								publishedAt: "2026-03-15T10:00:00Z",
							},
						},
					],
				}),
				text: async () => "{}",
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(youtubeChannelVideosNode);
			const ctx = createExecutionContext(
				{},
				{},
				{ youtube: { apiKey: "yt-key" } },
			);

			const result = await registry.execute(
				"youtube-channel-videos",
				{
					channelId: "ch1",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.videos).toHaveLength(1);
			expect(result.output?.videos[0].videoId).toBe("vid1");
		});
	});

	describe("rss-fetch", () => {
		it("parses RSS feed", async () => {
			const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <item>
      <title>Article One</title>
      <link>https://blog.example.com/article-one</link>
      <pubDate>Mon, 01 Apr 2026 08:00:00 GMT</pubDate>
      <description>First article description</description>
      <guid>https://blog.example.com/article-one</guid>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://blog.example.com/article-two</link>
      <pubDate>Tue, 02 Apr 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>Second article with CDATA</p>]]></description>
    </item>
  </channel>
</rss>`;

			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/rss+xml" }),
				text: async () => rssXml,
				json: async () => ({}),
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(rssFetchNode);
			const ctx = createExecutionContext();

			const result = await registry.execute(
				"rss-fetch",
				{
					url: "https://blog.example.com/feed",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.items).toHaveLength(2);
			expect(result.output?.items[0].title).toBe("Article One");
			expect(result.output?.items[1].description).toBe(
				"<p>Second article with CDATA</p>",
			);
			expect(result.output?.feedTitle).toBe("Test Blog");
		});

		it("parses Atom feed", async () => {
			const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <entry>
    <title>Atom Entry</title>
    <link href="https://blog.example.com/entry"/>
    <updated>2026-04-01T12:00:00Z</updated>
    <id>tag:blog,2026:entry</id>
    <summary>An atom entry</summary>
  </entry>
</feed>`;

			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/atom+xml" }),
				text: async () => atomXml,
				json: async () => ({}),
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(rssFetchNode);
			const ctx = createExecutionContext();

			const result = await registry.execute(
				"rss-fetch",
				{
					url: "https://blog.example.com/atom",
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.items).toHaveLength(1);
			expect(result.output?.items[0].title).toBe("Atom Entry");
			expect(result.output?.items[0].link).toBe(
				"https://blog.example.com/entry",
			);
		});
	});

	describe("tavily-search", () => {
		it("searches and returns results", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({
					results: [
						{
							title: "Result 1",
							url: "https://example.com/1",
							content: "Content 1",
							score: 0.9,
						},
						{
							title: "Result 2",
							url: "https://example.com/2",
							content: "Content 2",
							score: 0.8,
						},
					],
				}),
				text: async () => "{}",
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(tavilySearchNode);
			const ctx = createExecutionContext(
				{},
				{},
				{ tavily: { apiKey: "tv-key" } },
			);

			const result = await registry.execute(
				"tavily-search",
				{
					query: "typescript tutorial",
					maxResults: 5,
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.results).toHaveLength(2);
			expect(result.output?.results[0].score).toBe(0.9);
		});
	});

	describe("unsplash-search", () => {
		it("searches photos and returns structured results", async () => {
			vi.mocked(globalThis.fetch).mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({
					results: [
						{
							id: "photo1",
							urls: {
								regular: "https://images.unsplash.com/photo1",
								thumb: "https://images.unsplash.com/photo1-thumb",
							},
							alt_description: "A building",
							width: 1920,
							height: 1080,
							user: { name: "Photographer Name" },
						},
					],
				}),
				text: async () => "{}",
			} as unknown as Response);

			const registry = createRegistry();
			registry.register(unsplashSearchNode);
			const ctx = createExecutionContext(
				{},
				{},
				{ unsplash: { accessKey: "un-key" } },
			);

			const result = await registry.execute(
				"unsplash-search",
				{
					query: "modern architecture",
					count: 3,
				},
				ctx,
			);

			expect(result.success).toBe(true);
			expect(result.output?.photos).toHaveLength(1);
			expect(result.output?.photos[0]).toEqual(
				expect.objectContaining({
					id: "photo1",
					photographer: "Photographer Name",
					width: 1920,
				}),
			);

			// Verify auth header
			const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
			const headers = fetchCall[1]?.headers as Record<string, string>;
			expect(headers.Authorization).toBe("Client-ID un-key");
		});
	});
});
