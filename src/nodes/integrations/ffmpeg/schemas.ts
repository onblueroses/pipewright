import { z } from "zod";

export const FfmpegComposeInputSchema = z.object({
	audioPath: z.string(),
	slidePaths: z.array(z.string()).min(1),
	outputPath: z.string(),
	slideDurations: z.array(z.number().positive()),
	backgroundMusic: z.string().optional(),
	backgroundMusicVolume: z.number().min(0).max(1).default(0.1),
});

export type FfmpegComposeInput = z.infer<typeof FfmpegComposeInputSchema>;

export const FfmpegComposeOutputSchema = z.object({
	videoPath: z.string(),
	durationSeconds: z.number(),
});

export type FfmpegComposeOutput = z.infer<typeof FfmpegComposeOutputSchema>;
