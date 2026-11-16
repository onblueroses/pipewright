/**
 * Repair common LLM JSON defects before parsing.
 * Handles: markdown fences, // comments, trailing commas, smart quotes.
 */
export function sanitizeLlmJson(raw: string): string {
	return raw
		.replace(/^```(?:json|jsonc)?\s*\n([\s\S]*?)\n\s*```\s*$/i, "$1")
		.replace(/^\s*\/\/.*$/gm, "")
		.replace(/,(\s*[}\]])/g, "$1")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2018\u2019]/g, "'");
}
