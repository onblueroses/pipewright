import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import { appendInputSchema, appendOutputSchema } from "./schemas.js";

export const googleSheetsAppendNode = defineNode({
	type: "google-sheets-append",
	name: "Append to Google Sheet",
	description: "Add rows to the bottom of a sheet",

	category: "integration",
	inputSchema: appendInputSchema,
	outputSchema: appendOutputSchema,

	async executor(input, context) {
		const cred = context.credentials?.googleSheets;
		if (!cred?.accessToken) {
			return { success: false, error: "No access token" };
		}

		try {
			const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${input.range}:append?valueInputOption=${input.valueInputOption}`;

			const response = await fetchWithRetry(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${cred.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ values: input.values }),
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `API failed: ${text}` };
			}

			const data = await response.json();

			return {
				success: true,
				output: {
					updatedRange: data.updates.updatedRange,
					updatedRows: data.updates.updatedRows,
					updatedCells: data.updates.updatedCells,
				},
			};
		} catch (err: any) {
			return { success: false, error: err.message || "Unknown error" };
		}
	},
});
