import { z } from "zod";

export const HttpRequestInputSchema = z.object({
	url: z.string().url(),
	method: z
		.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
		.default("GET"),
	headers: z.record(z.string(), z.string()).optional(),
	body: z.unknown().optional(),
	timeoutMs: z.number().positive().optional(),
	/** Return 4xx and 5xx responses as output instead of failing the step. */
	allowHttpErrors: z.boolean().default(false),
});

export type HttpRequestInput = z.infer<typeof HttpRequestInputSchema>;

export const HttpRequestOutputSchema = z.object({
	status: z.number(),
	body: z.unknown(),
	headers: z.record(z.string(), z.string()),
});

export type HttpRequestOutput = z.infer<typeof HttpRequestOutputSchema>;
