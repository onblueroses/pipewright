import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type HttpRequestInput,
	HttpRequestInputSchema,
	HttpRequestOutputSchema,
} from "./schemas.js";

export const httpRequestNode = defineNode({
	type: "http-request",
	name: "HTTP Request",
	category: "integration",
	inputSchema: HttpRequestInputSchema,
	outputSchema: HttpRequestOutputSchema,
	executor: async (input: HttpRequestInput) => {
		const { url, method, headers, body, timeoutMs, allowHttpErrors } = input;

		const fetchOptions: RequestInit = {
			method,
			headers: headers as HeadersInit,
		};

		if (body !== undefined && method !== "GET" && method !== "HEAD") {
			fetchOptions.body =
				typeof body === "string" ? body : JSON.stringify(body);
			if (!headers?.["Content-Type"] && !headers?.["content-type"]) {
				fetchOptions.headers = {
					...headers,
					"Content-Type": "application/json",
				};
			}
		}

		const response = await fetchWithRetry(url, fetchOptions, {
			timeoutMs,
			allowHttpErrors,
		});

		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});

		const contentType = response.headers.get("content-type") ?? "";
		let responseBody: unknown;
		if (contentType.includes("application/json")) {
			responseBody = await response.json();
		} else {
			responseBody = await response.text();
		}

		return {
			success: true,
			output: {
				status: response.status,
				body: responseBody,
				headers: responseHeaders,
			},
		};
	},
});
