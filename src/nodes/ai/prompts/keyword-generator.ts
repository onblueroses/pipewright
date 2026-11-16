export const KEYWORD_GENERATION_PROMPT = `You are an expert at social media monitoring and search optimization. Given a topic description, generate search keywords for finding relevant posts on Twitter, Reddit, and LinkedIn.

<topic>
{{TOPIC}}
</topic>

{{USER_KEYWORDS_SECTION}}

Generate search keywords following these guidelines:

1. **Core Keywords**: Direct terms related to the topic
2. **Brand/Product Keywords**: Specific products/tools/brands if applicable
3. **Industry Terms**: Professional/industry-specific terminology

IMPORTANT CONSTRAINTS:
- For Reddit: Generate ONLY 8-12 specific, multi-word keywords. Reddit's search API has query length limits. Avoid generic single words like "frustrated", "recommend", "alternative". Focus on specific product names and multi-word phrases.
- For Twitter: Can be more comprehensive since Twitter handles longer queries well.
- For LinkedIn: Focus on professional context and industry terms.

Respond in this exact JSON format:
{
  "twitter": {
    "keywords": ["keyword1", "keyword2", ...],
    "searchQuery": "(keyword1 OR keyword2 OR \\"multi word\\") -is:retweet"
  },
  "reddit": {
    "keywords": ["keyword1", "keyword2", ...]
  },
  "linkedin": {
    "keywords": ["keyword1", "keyword2", ...],
    "searchQueries": ["query1", "query2", ...]
  }
}`;

export function buildUserKeywordsSection(userKeywords?: string[]): string {
	if (!userKeywords?.length) {
		return "";
	}

	return `<user_keywords>
The user also wants to include these specific keywords:
${userKeywords.join(", ")}
</user_keywords>`;
}

export function buildKeywordPrompt(
	topic: string,
	userKeywords?: string[],
): string {
	return KEYWORD_GENERATION_PROMPT.replace("{{TOPIC}}", topic).replace(
		"{{USER_KEYWORDS_SECTION}}",
		buildUserKeywordsSection(userKeywords),
	);
}
