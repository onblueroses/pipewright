import { z } from "zod";

export const OpenRouterGenerateInputSchema = z.object({
	prompt: z.string(),
	systemPrompt: z.string().optional(),
	model: z.string(),
	maxTokens: z.number().positive().optional(),
	temperature: z.number().min(0).max(2).optional(),
	jsonMode: z.boolean().default(false),
});

export type OpenRouterGenerateInput = z.infer<
	typeof OpenRouterGenerateInputSchema
>;

export const OpenRouterUsageSchema = z.object({
	promptTokens: z.number(),
	completionTokens: z.number(),
	totalTokens: z.number(),
});

export const OpenRouterGenerateOutputSchema = z.object({
	text: z.string(),
	usage: OpenRouterUsageSchema,
	model: z.string(),
	finishReason: z.string(),
});

export type OpenRouterGenerateOutput = z.infer<
	typeof OpenRouterGenerateOutputSchema
>;
