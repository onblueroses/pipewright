import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Examples import "pipewright" like a user would. Point that at the source.
const src = (path: string) =>
	fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^pipewright\/(.*)$/, replacement: src("$1/index.ts") },
			{ find: /^pipewright$/, replacement: src("index.ts") },
		],
	},
	test: {
		include: ["tests/**/*.test.ts"],
	},
});
