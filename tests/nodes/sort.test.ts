import { describe, expect, it } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { sortNode } from "../../src/nodes/transform/sort.js";

describe("sortNode", () => {
	const ctx = createExecutionContext();

	it("sorts by string property ascending", async () => {
		const result = await sortNode.executor(
			{
				items: [{ name: "Charlie" }, { name: "Alice" }, { name: "Bob" }],
				path: "name",
				direction: "asc",
			},
			ctx,
		);
		expect(result.success).toBe(true);
		expect(result.output?.results.map((i: any) => i.name)).toEqual([
			"Alice",
			"Bob",
			"Charlie",
		]);
	});

	it("sorts by numeric property descending", async () => {
		const result = await sortNode.executor(
			{
				items: [{ score: 10 }, { score: 50 }, { score: 30 }],
				path: "score",
				direction: "desc",
			},
			ctx,
		);
		expect(result.output?.results.map((i: any) => i.score)).toEqual([
			50, 30, 10,
		]);
	});

	it("handles empty array", async () => {
		const result = await sortNode.executor(
			{ items: [], path: "x", direction: "asc" },
			ctx,
		);
		expect(result.success).toBe(true);
		expect(result.output?.results).toEqual([]);
		expect(result.output?.count).toBe(0);
	});

	it("sorts by nested path", async () => {
		const result = await sortNode.executor(
			{
				items: [
					{ meta: { rank: 3 } },
					{ meta: { rank: 1 } },
					{ meta: { rank: 2 } },
				],
				path: "meta.rank",
				direction: "asc",
			},
			ctx,
		);
		expect(result.output?.results.map((i: any) => i.meta.rank)).toEqual([
			1, 2, 3,
		]);
	});

	it("handles null values by sorting them last", async () => {
		const result = await sortNode.executor(
			{
				items: [{ v: 2 }, { v: null }, { v: 1 }],
				path: "v",
				direction: "asc",
			},
			ctx,
		);
		expect(result.output?.results.map((i: any) => i.v)).toEqual([1, 2, null]);
	});
});
