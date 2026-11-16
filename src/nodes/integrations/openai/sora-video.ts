import { z } from "zod";
import { defineNode } from "../../../core/node.js";
import { fetchWithRetry, sleep } from "../../../utils/http.js";

// =============================================================================
// Constants
// =============================================================================

const OPENAI_API_BASE = "https://api.openai.com/v1";

// =============================================================================
// Types
// =============================================================================

interface SoraVideoCreateResponse {
	id: string;
	status: "pending" | "processing" | "completed" | "failed";
}

interface SoraVideoStatusResponse {
	id: string;
	status: "pending" | "processing" | "completed" | "failed";
	output?: {
		url: string;
	};
	error?: {
		message: string;
	};
}

// =============================================================================
// Schemas
// =============================================================================

export const SoraVideoInputSchema = z.object({
	/** Detailed description of the video to generate */
	prompt: z.string(),
	/** Sora model to use */
	model: z.enum(["sora-2", "sora-2-pro"]).optional().default("sora-2"),
	/** Video duration in seconds */
	seconds: z
		.union([z.literal(4), z.literal(8), z.literal(12)])
		.optional()
		.default(4),
	/** Video dimensions */
	size: z
		.enum(["720x1280", "1280x720", "1024x1792", "1792x1024"])
		.optional()
		.default("1280x720"),
});

export type SoraVideoInput = z.infer<typeof SoraVideoInputSchema>;

export const SoraVideoOutputSchema = z.object({
	video: z.object({
		url: z.string(),
		durationSeconds: z.number(),
		size: z.string(),
		model: z.string(),
	}),
	processingTimeSeconds: z.number(),
});

export type SoraVideoOutput = z.infer<typeof SoraVideoOutputSchema>;

// =============================================================================
// API Functions
// =============================================================================

/**
 * Create a Sora video generation request
 */
async function createSoraVideo(
	apiKey: string,
	params: {
		prompt: string;
		model: string;
		seconds: number;
		size: string;
	},
): Promise<SoraVideoCreateResponse> {
	const formData = new FormData();
	formData.append("prompt", params.prompt);
	formData.append("model", params.model);
	formData.append("seconds", params.seconds.toString());
	formData.append("size", params.size);

	const response = await fetchWithRetry(`${OPENAI_API_BASE}/videos`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
	}

	return response.json() as Promise<SoraVideoCreateResponse>;
}

/**
 * Check the status of a Sora video generation
 */
async function getSoraVideoStatus(
	apiKey: string,
	videoId: string,
): Promise<SoraVideoStatusResponse> {
	const response = await fetchWithRetry(
		`${OPENAI_API_BASE}/videos/${videoId}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
	}

	return response.json() as Promise<SoraVideoStatusResponse>;
}

/**
 * Wait for video generation to complete with polling
 */
async function waitForVideoCompletion(
	apiKey: string,
	videoId: string,
): Promise<SoraVideoStatusResponse> {
	const pollIntervalMs = 5000;

	for (;;) {
		const status = await getSoraVideoStatus(apiKey, videoId);

		if (status.status === "completed") {
			return status;
		}

		if (status.status === "failed") {
			throw new Error(status.error?.message || "Video generation failed");
		}

		await sleep(pollIntervalMs);
	}
}

// =============================================================================
// Node Definition
// =============================================================================

/**
 * Sora Video Generation Node
 *
 * Generates videos using OpenAI Sora 2 API.
 * Requires `context.credentials.openai.apiKey` to be provided.
 *
 * @example
 * ```typescript
 * const result = await soraVideoNode.executor({
 *   prompt: 'A serene ocean sunset with waves gently crashing',
 *   model: 'sora-2',
 *   seconds: 8,
 *   size: '1280x720'
 * }, context);
 * ```
 */
export const soraVideoNode = defineNode({
	type: "sora-video",
	name: "Generate Sora Video",
	description: "Generate AI video using OpenAI Sora 2",
	category: "integration",
	inputSchema: SoraVideoInputSchema,
	outputSchema: SoraVideoOutputSchema,

	executor: async (input, context) => {
		try {
			// Check for API key
			const apiKey = context.credentials?.openai?.apiKey;
			if (!apiKey) {
				return {
					success: false,
					error:
						"OpenAI API key not configured. Please provide context.credentials.openai.apiKey.",
				};
			}

			const startTime = Date.now();

			// Create video generation request
			const createResponse = await createSoraVideo(apiKey, {
				prompt: input.prompt,
				model: input.model || "sora-2",
				seconds: input.seconds || 4,
				size: input.size || "1280x720",
			});

			// Wait for completion
			const completedVideo = await waitForVideoCompletion(
				apiKey,
				createResponse.id,
			);

			const processingTimeSeconds = Math.round((Date.now() - startTime) / 1000);

			if (!completedVideo.output?.url) {
				return {
					success: false,
					error: "Video generation completed but no URL returned",
				};
			}

			return {
				success: true,
				output: {
					video: {
						url: completedVideo.output.url,
						durationSeconds: input.seconds || 4,
						size: input.size || "1280x720",
						model: input.model || "sora-2",
					},
					processingTimeSeconds,
				},
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to generate video",
			};
		}
	},
});
