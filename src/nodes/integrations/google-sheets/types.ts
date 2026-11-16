import type { z } from "zod";
import type {
	appendInputSchema,
	appendOutputSchema,
	clearInputSchema,
	clearOutputSchema,
	readInputSchema,
	readOutputSchema,
	updateInputSchema,
	updateOutputSchema,
} from "./schemas.js";

export type AppendInput = z.infer<typeof appendInputSchema>;
export type AppendOutput = z.infer<typeof appendOutputSchema>;
export type ClearInput = z.infer<typeof clearInputSchema>;
export type ClearOutput = z.infer<typeof clearOutputSchema>;
export type ReadInput = z.infer<typeof readInputSchema>;
export type ReadOutput = z.infer<typeof readOutputSchema>;
export type UpdateInput = z.infer<typeof updateInputSchema>;
export type UpdateOutput = z.infer<typeof updateOutputSchema>;
