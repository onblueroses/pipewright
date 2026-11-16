import { fetchWithRetry } from "./http.js";

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

interface MessagesResponse {
	content: Array<{ type: string; text?: string }>;
	stop_reason: string;
}

/**
 * One Messages API call that returns the text of the reply. It throws when the
 * reply is cut off, refused, or has no text, so a node never reads half an answer.
 */
export async function generateText(
	apiKey: string,
	prompt: string,
	options: { model?: string; maxTokens?: number } = {},
): Promise<string> {
	// Thinking tokens count toward max_tokens, so leave room for them.
	const { model = DEFAULT_ANTHROPIC_MODEL, maxTokens = 16000 } = options;
	const response = await fetchWithRetry(`${ANTHROPIC_API_BASE}/messages`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": ANTHROPIC_VERSION,
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	const data = (await response.json()) as MessagesResponse;
	if (data.stop_reason === "refusal" || data.stop_reason === "max_tokens") {
		throw new Error(`Anthropic reply stopped early: ${data.stop_reason}`);
	}
	const text = data.content
		.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("");
	if (!text) throw new Error("Anthropic reply has no text");
	return text;
}
