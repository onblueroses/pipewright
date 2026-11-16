import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type ApifyGetDatasetInput,
	ApifyGetDatasetInputSchema,
	type ApifyGetDatasetOutput,
	ApifyGetDatasetOutputSchema,
} from "./schemas.js";

const APIFY_API_BASE = "https://api.apify.com/v2";

// =============================================================================
// Apify API Types
// =============================================================================

interface ApifyDatasetItemsResponse {
	items: Record<string, unknown>[];
	count: number;
	total: number;
	offset: number;
	limit: number | null;
	desc: boolean;
}

// =============================================================================
// Node Definition
// =============================================================================

export {
	type ApifyGetDatasetInput,
	ApifyGetDatasetInputSchema,
	type ApifyGetDatasetOutput,
	ApifyGetDatasetOutputSchema,
} from "./schemas.js";

/**
 * Apify Get Dataset Node
 *
 * Retrieves items from an Apify dataset by its ID.
 * Supports pagination via limit/offset and multiple output formats.
 *
 * @example
 * ```typescript
 * const result = await apifyGetDatasetNode.executor({
 *   datasetId: 'abc123',
 *   limit: 100,
 *   offset: 0,
 *   format: 'json',
 * }, context);
 * ```
 */
export const apifyGetDatasetNode = defineNode({
	type: "apify-get-dataset",
	name: "Apify Get Dataset",
	description: "Retrieve items from an Apify dataset",
	category: "integration",
	inputSchema: ApifyGetDatasetInputSchema,
	outputSchema: ApifyGetDatasetOutputSchema,

	executor: async (input: ApifyGetDatasetInput, context) => {
		try {
			const apiToken = context.credentials?.apify?.apiToken as
				| string
				| undefined;
			if (!apiToken) {
				return {
					success: false,
					error:
						"Apify API token not configured. Please provide context.credentials.apify.apiToken.",
				};
			}

			const params = new URLSearchParams({ format: input.format });
			if (input.limit != null) params.set("limit", String(input.limit));
			if (input.offset != null) params.set("offset", String(input.offset));

			const response = await fetchWithRetry(
				`${APIFY_API_BASE}/datasets/${input.datasetId}/items?${params.toString()}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiToken}`,
					},
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `Apify dataset error: ${response.status} - ${errorText}`,
				};
			}

			const data = (await response.json()) as ApifyDatasetItemsResponse;

			const output: ApifyGetDatasetOutput = {
				items: data.items,
				count: data.count,
				total: data.total,
				offset: data.offset,
				limit: data.limit,
				datasetId: input.datasetId,
			};

			return { success: true, output };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to retrieve Apify dataset",
			};
		}
	},
});
