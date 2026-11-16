import { z } from "zod";

export const appendInputSchema = z.object({
	spreadsheetId: z.string().min(1, "Spreadsheet ID required"),
	range: z.string().default("Sheet1!A:Z"),
	values: z.array(z.array(z.any())), // rows as 2D list
	valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
});

export const appendOutputSchema = z.object({
	updatedRange: z.string(),
	updatedRows: z.number(),
	updatedCells: z.number(),
});

export const clearInputSchema = z.object({
	spreadsheetId: z.string().min(1, "Spreadsheet ID required"),
	range: z.string().default("Sheet1!A:Z"),
});

export const clearOutputSchema = z.object({
	clearedRange: z.string(),
});

export const readInputSchema = z.object({
	spreadsheetId: z.string().min(1, "Spreadsheet ID required"),
	range: z.string().default("Sheet1!A:Z"),
});

export const readOutputSchema = z.object({
	rows: z.array(z.array(z.any())),
	rowCount: z.number(),
});

export const updateInputSchema = z.object({
	spreadsheetId: z.string().min(1, "Spreadsheet ID required"),
	rowNumber: z.number().min(1, "Row number must be at least 1"),
	values: z.array(z.any()),
	valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("USER_ENTERED"),
});

export const updateOutputSchema = z.object({
	updatedRange: z.string(),
	updatedRows: z.number(),
	updatedCells: z.number(),
});
