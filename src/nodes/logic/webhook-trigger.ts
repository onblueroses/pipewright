import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { defineNode } from "../../core/node.js";

function safeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const WebhookTriggerInputSchema = z.object({
	path: z.string().min(1).regex(/^\//, "Path must start with /"),
	method: z.enum(["GET", "POST", "PUT"]),
	authentication: z
		.object({
			type: z.enum(["none", "basic", "header"]),
			credentials: z.record(z.string(), z.string()).optional(),
		})
		.optional(),
	responseCode: z.number().int().min(100).max(599).default(200).optional(),
	responseData: z.unknown().optional(),
});

export type WebhookTriggerInput = z.infer<typeof WebhookTriggerInputSchema>;

export const WebhookTriggerOutputSchema = z.object({
	body: z.unknown(),
	headers: z.record(z.string(), z.string()),
	method: z.string(),
	path: z.string(),
	query: z.record(z.string(), z.string()),
	timestamp: z.string(),
	authenticated: z.boolean(),
	responseCode: z.number().int().min(100).max(599),
	responseData: z.unknown().optional(),
});

export type WebhookTriggerOutput = z.infer<typeof WebhookTriggerOutputSchema>;

export const webhookTriggerNode = defineNode({
	type: "webhook-trigger",
	name: "Webhook Receiver",
	description:
		"Validate and extract a webhook payload from context. The host must inject webhookRequest into context before executing this node.",
	category: "logic",
	inputSchema: WebhookTriggerInputSchema,
	outputSchema: WebhookTriggerOutputSchema,
	executor: async (input, context) => {
		try {
			const webhookRequest = context.get("webhookRequest") as
				| {
						method?: string;
						headers?: Record<string, string>;
						body?: unknown;
						path?: string;
						query?: Record<string, string>;
				  }
				| undefined;

			if (!webhookRequest) {
				return {
					success: false,
					error:
						"No webhook request data found in context. Ensure the host application injects webhookRequest into context.variables before executing this node.",
				};
			}

			if (webhookRequest.method?.toUpperCase() !== input.method) {
				return {
					success: false,
					error: `Method mismatch: expected ${input.method}, received ${webhookRequest.method}`,
				};
			}

			let authenticated = false;
			const authType = input.authentication?.type ?? "none";

			if (authType === "none") {
				authenticated = true;
			} else if (authType === "basic") {
				const authHeader = webhookRequest.headers?.authorization;
				if (!authHeader?.startsWith("Basic ")) {
					return {
						success: false,
						error: "Basic authentication failed: invalid credentials",
					};
				}

				const base64 = authHeader.slice(6);
				const decoded = Buffer.from(base64, "base64").toString("utf-8");
				const colonIndex = decoded.indexOf(":");
				if (colonIndex === -1) {
					return {
						success: false,
						error: "Basic authentication failed: invalid credentials",
					};
				}

				const username = decoded.slice(0, colonIndex);
				const password = decoded.slice(colonIndex + 1);
				const expectedUsername = input.authentication?.credentials?.username;
				const expectedPassword = input.authentication?.credentials?.password;

				if (
					!expectedUsername ||
					!expectedPassword ||
					!safeCompare(username, expectedUsername) ||
					!safeCompare(password, expectedPassword)
				) {
					return {
						success: false,
						error: "Basic authentication failed: invalid credentials",
					};
				}

				authenticated = true;
			} else if (authType === "header") {
				const credentials = input.authentication?.credentials ?? {};
				for (const [key, expectedValue] of Object.entries(credentials)) {
					const actualValue = webhookRequest.headers?.[key.toLowerCase()];
					if (!actualValue || !safeCompare(actualValue, expectedValue)) {
						return {
							success: false,
							error: "Header authentication failed: missing or invalid header",
						};
					}
				}
				authenticated = true;
			}

			return {
				success: true,
				output: {
					body: webhookRequest.body ?? null,
					headers: webhookRequest.headers ?? {},
					method: webhookRequest.method!,
					path: webhookRequest.path ?? input.path,
					query: webhookRequest.query ?? {},
					timestamp: new Date().toISOString(),
					authenticated,
					responseCode: input.responseCode ?? 200,
					responseData: input.responseData,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},
});
