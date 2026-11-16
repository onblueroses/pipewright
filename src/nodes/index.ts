// The node library: "pipewright/nodes". Nodes take credentials from the
// context and never read the environment.

import { socialAiAnalyzeNode } from "./ai/analyze-posts.js";
import { socialKeywordGeneratorNode } from "./ai/keyword-generator.js";
import { apifyGetDatasetNode } from "./integrations/apify/get-dataset.js";
import { apifyGetRunStatusNode } from "./integrations/apify/get-run-status.js";
import { apifyRunActorNode } from "./integrations/apify/run-actor.js";
import { dataforseoGetBacklinksNode } from "./integrations/dataforseo/backlinks.js";
import { seoKeywordResearchNode } from "./integrations/dataforseo/keyword-research.js";
import { dataforseoPeopleAlsoAskNode } from "./integrations/dataforseo/people-also-ask.js";
import { seoAuditNode } from "./integrations/dataforseo/seo-audit.js";
import { dataforseoSerpNode } from "./integrations/dataforseo/serp.js";
import { devtoCreateArticleNode } from "./integrations/devto/create-article.js";
import { devtoGetArticlesNode } from "./integrations/devto/get-articles.js";
import { devtoUpdateArticleNode } from "./integrations/devto/update-article.js";
import { discordCreateThreadNode } from "./integrations/discord/create-thread.js";
import { discordSendMessageNode } from "./integrations/discord/send-message.js";
import { discordSendWebhookNode } from "./integrations/discord/send-webhook.js";
import { elevenlabsTtsNode } from "./integrations/elevenlabs/index.js";
import { ffmpegComposeNode } from "./integrations/ffmpeg/index.js";
import {
	fileReadNode,
	fileWriteNode,
} from "./integrations/filesystem/index.js";
import { firecrawlCrawlNode } from "./integrations/firecrawl/crawl.js";
import { firecrawlExtractNode } from "./integrations/firecrawl/extract.js";
import { firecrawlScrapeNode } from "./integrations/firecrawl/scrape.js";
import { gitOperationsNode } from "./integrations/git/index.js";
import { googleSheetsAppendNode } from "./integrations/google-sheets/googleSheetsAppend.js";
import { googleSheetsClearNode } from "./integrations/google-sheets/googleSheetsClear.js";
import { googleSheetsReadNode } from "./integrations/google-sheets/googleSheetsRead.js";
import { googleSheetsUpdateNode } from "./integrations/google-sheets/googleSheetsUpdate.js";
import { httpRequestNode } from "./integrations/http/index.js";
import { soraVideoNode } from "./integrations/openai/sora-video.js";
import { openrouterGenerateNode } from "./integrations/openrouter/index.js";
import { rssFetchNode } from "./integrations/rss/index.js";
import { redditMonitorNode } from "./integrations/social/reddit-monitor.js";
import { twitterGetUserByUsernameNode } from "./integrations/social/twitter-get-user-by-username.js";
import { twitterMonitorNode } from "./integrations/social/twitter-monitor.js";
import { twitterSearchTweetsNode } from "./integrations/social/twitter-search-tweets.js";
import { sqliteQueryNode } from "./integrations/sqlite/index.js";
import { sshExecNode } from "./integrations/ssh/index.js";
import { tavilySearchNode } from "./integrations/tavily/index.js";
import { unsplashSearchNode } from "./integrations/unsplash/index.js";
import { wordpressCreatePostNode } from "./integrations/wordpress/createPost.js";
import { wordpressGetPostsNode } from "./integrations/wordpress/getPosts.js";
import { wordpressUpdatePostNode } from "./integrations/wordpress/updatePost.js";
import { wordpressUploadMediaNode } from "./integrations/wordpress/uploadMedia.js";
import {
	youtubeChannelVideosNode,
	youtubeSearchNode,
} from "./integrations/youtube-api/index.js";

export { generateText } from "../utils/anthropic.js";
export type { FetchWithRetryOptions } from "../utils/http.js";
export {
	FetchRetryError,
	fetchWithRetry,
	parseJsonResponse,
} from "../utils/http.js";
export * from "./ai/index.js";
export * from "./integrations/index.js";

/** Every integration and AI node. Register with `registry.registerAll(integrationNodes)`. */
export const integrationNodes = [
	// AI
	socialKeywordGeneratorNode,
	socialAiAnalyzeNode,
	openrouterGenerateNode,
	soraVideoNode,
	elevenlabsTtsNode,
	// Web and search
	httpRequestNode,
	rssFetchNode,
	tavilySearchNode,
	firecrawlScrapeNode,
	firecrawlCrawlNode,
	firecrawlExtractNode,
	apifyRunActorNode,
	apifyGetRunStatusNode,
	apifyGetDatasetNode,
	youtubeSearchNode,
	youtubeChannelVideosNode,
	unsplashSearchNode,
	// SEO
	seoKeywordResearchNode,
	seoAuditNode,
	dataforseoGetBacklinksNode,
	dataforseoPeopleAlsoAskNode,
	dataforseoSerpNode,
	// Social monitors (read-only)
	redditMonitorNode,
	twitterMonitorNode,
	twitterSearchTweetsNode,
	twitterGetUserByUsernameNode,
	// Messaging and publishing
	discordSendMessageNode,
	discordSendWebhookNode,
	discordCreateThreadNode,
	devtoCreateArticleNode,
	devtoUpdateArticleNode,
	devtoGetArticlesNode,
	wordpressCreatePostNode,
	wordpressUpdatePostNode,
	wordpressGetPostsNode,
	wordpressUploadMediaNode,
	// Data
	googleSheetsReadNode,
	googleSheetsAppendNode,
	googleSheetsUpdateNode,
	googleSheetsClearNode,
	sqliteQueryNode,
	fileReadNode,
	fileWriteNode,
	// Local tools
	gitOperationsNode,
	sshExecNode,
	ffmpegComposeNode,
] as const;
