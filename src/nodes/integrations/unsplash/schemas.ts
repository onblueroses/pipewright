import { z } from "zod";

export const UnsplashSearchInputSchema = z.object({
	query: z.string(),
	count: z.number().min(1).max(30).default(5),
	orientation: z.enum(["landscape", "portrait", "squarish"]).optional(),
});

export type UnsplashSearchInput = z.infer<typeof UnsplashSearchInputSchema>;

const UnsplashPhotoSchema = z.object({
	id: z.string(),
	url: z.string(),
	thumbUrl: z.string(),
	altDescription: z.string().optional(),
	width: z.number(),
	height: z.number(),
	photographer: z.string(),
});

export const UnsplashSearchOutputSchema = z.object({
	photos: z.array(UnsplashPhotoSchema),
});

export type UnsplashSearchOutput = z.infer<typeof UnsplashSearchOutputSchema>;
