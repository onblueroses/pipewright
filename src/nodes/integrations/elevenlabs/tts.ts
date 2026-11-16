import { writeFile } from "node:fs/promises";
import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type ElevenlabsTtsInput,
	ElevenlabsTtsInputSchema,
	ElevenlabsTtsOutputSchema,
} from "./schemas.js";

const MAX_CHUNK_SIZE = 2000;

/** Split text into chunks at sentence boundaries, respecting max size. */
function chunkText(text: string): string[] {
	if (text.length <= MAX_CHUNK_SIZE) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= MAX_CHUNK_SIZE) {
			chunks.push(remaining);
			break;
		}

		// Find sentence boundary near the limit
		const slice = remaining.slice(0, MAX_CHUNK_SIZE);
		const lastPeriod = slice.lastIndexOf(". ");
		const splitAt =
			lastPeriod > MAX_CHUNK_SIZE / 2 ? lastPeriod + 2 : MAX_CHUNK_SIZE;

		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt);
	}

	return chunks;
}

export const elevenlabsTtsNode = defineNode({
	type: "elevenlabs-tts",
	name: "ElevenLabs TTS",
	category: "integration",
	inputSchema: ElevenlabsTtsInputSchema,
	outputSchema: ElevenlabsTtsOutputSchema,
	executor: async (input: ElevenlabsTtsInput, context) => {
		const apiKey = (context.credentials?.elevenlabs as { apiKey?: string })
			?.apiKey;
		if (!apiKey) return { success: false, error: "Missing ElevenLabs API key" };

		const chunks = chunkText(input.text);
		const audioBuffers: Buffer[] = [];

		for (const chunk of chunks) {
			const response = await fetchWithRetry(
				`https://api.elevenlabs.io/v1/text-to-speech/${input.voiceId}`,
				{
					method: "POST",
					headers: {
						"xi-api-key": apiKey,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						text: chunk,
						model_id: input.model,
						voice_settings: { speed: input.speed },
					}),
				},
			);

			const arrayBuf = await response.arrayBuffer();
			audioBuffers.push(Buffer.from(arrayBuf));
		}

		const combined = Buffer.concat(audioBuffers);
		await writeFile(input.outputPath, combined);

		// Rough estimate: ~150 words per minute, ~5 chars per word
		const estimatedDuration = (input.text.length / 5 / 150) * 60;

		return {
			success: true,
			output: {
				audioPath: input.outputPath,
				durationEstimate: Math.round(estimatedDuration * 10) / 10,
				charactersUsed: input.text.length,
			},
		};
	},
});
