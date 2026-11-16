import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import { updateInputSchema, updateOutputSchema } from "./schemas.js";

export const googleSheetsUpdateNode = defineNode({
	type: "google-sheets-update",
	name: "Update Google Sheet",
	description: "Update a row in a sheet",

	category: "integration",
	inputSchema: updateInputSchema,
	outputSchema: updateOutputSchema,

	async executor(input, context) {
		const cred = context.credentials?.googleSheets;
		if (!cred?.accessToken) {
			return { success: false, error: "No access token" };
		}

		try {
			const range = `Sheet1!A${input.rowNumber}`;
			const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${range}?valueInputOption=${input.valueInputOption}`;

			const response = await fetchWithRetry(url, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${cred.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ values: [input.values] }),
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `API failed: ${text}` };
			}

			const data = await response.json();

			return {
				success: true,
				output: {
					updatedRange: data.updatedRange,
					updatedRows: data.updatedRows,
					updatedCells: data.updatedCells,
				},
			};
		} catch (err: any) {
			return { success: false, error: err.message || "Unknown error" };
		}
	},
});
