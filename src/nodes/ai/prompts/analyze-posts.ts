import type { SocialPost } from "../schemas.js";

export const ANALYSIS_PROMPT = `You are analyzing social media posts to find ones relevant to a user's monitoring topic.

<user_topic>
{{TOPIC}}
</user_topic>

<user_intent>
{{INTENT}}
</user_intent>

Analyze each post and determine:
1. **Relevance Score (0-100)**: How relevant is this post to what the user is looking for?
2. **Sentiment**: Is the post positive, negative, or neutral about the topic?
3. **Is Complaint**: Is this post a complaint or expressing frustration?
4. **Urgency Level**:
   - HIGH: Urgent issue, direct complaint, someone actively looking for alternatives
   - MEDIUM: General discussion, mild frustration, asking questions
   - LOW: Casual mention, positive review, tangentially related
5. **Summary**: 2-3 sentence summary of what this post is about
6. **Matched Keywords**: Which keywords/concepts from the topic match this post

<posts>
{{POSTS_JSON}}
</posts>

Respond with a JSON array of analyzed posts:
[
  {
    "id": "post_id",
    "relevanceScore": 85,
    "sentiment": "negative",
    "isComplaint": true,
    "urgencyLevel": "high",
    "aiSummary": "User is frustrated with...",
    "matchedKeywords": ["keyword1", "keyword2"]
  }
]

Only include posts with relevance score >= 30. Filter out irrelevant posts entirely.`;

export function buildAnalysisPrompt(
	topic: string,
	userIntent: string,
	posts: SocialPost[],
): string {
	return ANALYSIS_PROMPT.replace("{{TOPIC}}", topic)
		.replace("{{INTENT}}", userIntent)
		.replace("{{POSTS_JSON}}", JSON.stringify(posts, null, 2));
}

export function normalizeSentiment(
	s: string,
): "positive" | "negative" | "neutral" {
	const lower = String(s).toLowerCase().trim();
	if (lower === "positive") return "positive";
	if (lower === "negative") return "negative";
	return "neutral";
}

export function normalizeUrgency(u: string): "low" | "medium" | "high" {
	const lower = String(u).toLowerCase().trim();
	if (lower === "high") return "high";
	if (lower === "medium") return "medium";
	return "low";
}

export const MIN_RELEVANCE_SCORE = 30;
export const ANALYSIS_BATCH_SIZE = 20;
