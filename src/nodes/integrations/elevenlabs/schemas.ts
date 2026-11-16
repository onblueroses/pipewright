import { z } from "zod";

export const ElevenlabsTtsInputSchema = z.object({
	text: z.string(),
	voiceId: z.string().default("21m00Tcm4TlvDq8ikWAM"),
	model: z.string().default("eleven_multilingual_v2"),
	outputPath: z.string(),
	speed: z.number().min(0.25).max(4).default(1),
});

export type ElevenlabsTtsInput = z.infer<typeof ElevenlabsTtsInputSchema>;

export const ElevenlabsTtsOutputSchema = z.object({
	audioPath: z.string(),
	durationEstimate: z.number(),
	charactersUsed: z.number(),
});

export type ElevenlabsTtsOutput = z.infer<typeof ElevenlabsTtsOutputSchema>;
