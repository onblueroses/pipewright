import { describe, expect, it } from "vitest";
import { runFanOut } from "../../examples/dag-fan-out.js";

describe("dag-fan-out example", () => {
	it("runs both sources in one wave, then merges and ranks", async () => {
		const result = await runFanOut();
		expect(result.success).toBe(true);
		expect(result.steps.map((s) => s.stepId)).toEqual([
			"news",
			"blog",
			"merge",
			"rank",
		]);
		expect(result.steps.at(-1)?.result.output).toEqual({
			results: [
				{ title: "Design notes", score: 7 },
				{ title: "Release notes", score: 3 },
			],
			count: 2,
		});
	});
});
