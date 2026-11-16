import { z } from "zod";

export const GoogleSheetsCredential = {
	name: "googleSheets" as const,
	type: "oauth2" as const,
	displayName: "Google Sheets",
	documentationUrl: "https://developers.google.com/sheets/api/quickstart/js",
	config: {
		authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
		tokenUrl: "https://oauth2.googleapis.com/token",
		scopes: [
			"https://www.googleapis.com/auth/spreadsheets",
			"https://www.googleapis.com/auth/drive.file",
		],
	},
	schema: z.object({
		accessToken: z.string(),
		refreshToken: z.string().optional(),
		expiresAt: z.number().optional(),
	}),
};
