import { defineNode } from "../../../core/node.js";
import { fetchWithRetry } from "../../../utils/http.js";
import {
	type RssFetchInput,
	RssFetchInputSchema,
	RssFetchOutputSchema,
} from "./schemas.js";

/** Extract text content from an XML tag. Returns empty string if not found. */
function extractTag(xml: string, tag: string): string {
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
	const match = xml.match(re);
	if (!match) return "";
	// Strip CDATA wrappers
	return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

/** Parse RSS/Atom XML into structured items. */
function parseRss(xml: string): {
	feedTitle?: string;
	items: Array<{
		title: string;
		link: string;
		pubDate?: string;
		description?: string;
		guid?: string;
	}>;
} {
	const feedTitle = extractTag(xml, "title") || undefined;

	// Try RSS <item> elements first, then Atom <entry>
	const isAtom = xml.includes("<feed") && xml.includes("<entry");
	const itemTag = isAtom ? "entry" : "item";
	const itemRegex = new RegExp(
		`<${itemTag}[\\s>][\\s\\S]*?</${itemTag}>`,
		"gi",
	);
	const rawItems = xml.match(itemRegex) ?? [];

	const items = rawItems.map((itemXml) => {
		const title = extractTag(itemXml, "title");

		let link: string;
		if (isAtom) {
			// Atom uses <link href="..."/>
			const linkMatch = itemXml.match(/<link[^>]*href="([^"]+)"/i);
			link = linkMatch?.[1] ?? extractTag(itemXml, "link");
		} else {
			link = extractTag(itemXml, "link");
		}

		const pubDate =
			extractTag(itemXml, isAtom ? "updated" : "pubDate") ||
			extractTag(itemXml, "published") ||
			undefined;

		const description =
			extractTag(itemXml, isAtom ? "summary" : "description") || undefined;

		const guid = extractTag(itemXml, isAtom ? "id" : "guid") || undefined;

		return { title, link, pubDate, description, guid };
	});

	return { feedTitle, items };
}

export const rssFetchNode = defineNode({
	type: "rss-fetch",
	name: "RSS Fetch",
	category: "integration",
	inputSchema: RssFetchInputSchema,
	outputSchema: RssFetchOutputSchema,
	executor: async (input: RssFetchInput) => {
		const response = await fetchWithRetry(input.url);

		const xml = await response.text();
		const parsed = parseRss(xml);

		return {
			success: true,
			output: {
				feedTitle: parsed.feedTitle,
				items: parsed.items.slice(0, input.maxItems),
			},
		};
	},
});
