import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import { clearInputSchema, clearOutputSchema } from "./schemas.js";

export const googleSheetsClearNode = defineNode({
	type: "google-sheets-clear",
	name: "Clear Google Sheet",
	description: "Clear a range of cells in a sheet",

	category: "integration",
	inputSchema: clearInputSchema,
	outputSchema: clearOutputSchema,

	async executor(input, context) {
		const cred = context.credentials?.googleSheets;
		if (!cred?.accessToken) {
			return { success: false, error: "No access token" };
		}

		try {
			const range = input.range ?? "Sheet1!A:Z";
			const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${range}:clear`;

			const response = await fetchWithRetry(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${cred.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `API failed: ${text}` };
			}

			const data = await response.json();

			return {
				success: true,
				output: {
					clearedRange: data.clearedRange,
				},
			};
		} catch (err: any) {
			return { success: false, error: err.message || "Unknown error" };
		}
	},
});
