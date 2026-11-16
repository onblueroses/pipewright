import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	normalizeWordPressMedia,
	type WordPressApiMedia,
	type WordPressUploadMediaInput,
	WordPressUploadMediaInputSchema,
	WordPressUploadMediaOutputSchema,
} from "./schemas.js";
import { resolveWordPressAuth } from "./utils.js";

export const wordpressUploadMediaNode = defineNode({
	type: "wordpress-upload-media",
	name: "WordPress Upload Media",
	description: "Upload a media file to the WordPress media library",
	category: "integration",
	inputSchema: WordPressUploadMediaInputSchema,
	outputSchema: WordPressUploadMediaOutputSchema,
	executor: async (input: WordPressUploadMediaInput, context) => {
		try {
			const authResult = resolveWordPressAuth(context.credentials?.wordpress);
			if ("error" in authResult) {
				return { success: false, error: authResult.error };
			}
			const { baseUrl, authHeader } = authResult;

			const fileBuffer = Buffer.from(input.contentBase64, "base64");
			const formData = new FormData();
			const blob = new Blob([fileBuffer], { type: input.mimeType });
			formData.append("file", blob, input.filename);

			const response = await fetchWithRetry(`${baseUrl}/wp-json/wp/v2/media`, {
				method: "POST",
				headers: {
					Authorization: authHeader,
					"Content-Disposition": `attachment; filename="${input.filename}"`,
				},
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `WordPress API error ${response.status}: ${errorText}`,
				};
			}

			const data = (await response.json()) as WordPressApiMedia;

			return {
				success: true,
				output: normalizeWordPressMedia(data),
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	},
});
