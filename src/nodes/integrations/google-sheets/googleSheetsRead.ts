import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import { readInputSchema, readOutputSchema } from "./schemas.js";

export const googleSheetsReadNode = defineNode({
	type: "google-sheets-read",
	name: "Read Google Sheet",
	description: "Read rows from a sheet",

	category: "integration",
	inputSchema: readInputSchema,
	outputSchema: readOutputSchema,

	async executor(input, context) {
		const cred = context.credentials?.googleSheets;
		if (!cred?.accessToken) {
			return { success: false, error: "No access token" };
		}

		try {
			const range = input.range ?? "Sheet1!A:Z";
			const url = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${range}`;

			const response = await fetchWithRetry(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${cred.accessToken}`,
				},
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `API failed: ${text}` };
			}

			const data = await response.json();
			const rows: any[][] = data.values ?? [];

			return {
				success: true,
				output: {
					rows,
					rowCount: rows.length,
				},
			};
		} catch (err: any) {
			return { success: false, error: err.message || "Unknown error" };
		}
	},
});
