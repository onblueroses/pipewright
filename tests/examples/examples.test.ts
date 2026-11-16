import { describe, expect, it } from "vitest";
import {
	buildCommunityResponderWorkflow,
	buildDailyContentPublisherWorkflow,
	buildSourceMonitorWorkflow,
	buildVideoPipelineWorkflow,
	runDailyContentPublisher,
	runSourceMonitor,
	runVideoPipeline,
} from "../../examples/index.js";

describe("source-monitor example", () => {
	it("produces a digest of relevant items", async () => {
		const result = await runSourceMonitor({
			topics: ["typescript release"],
			items: [
				{
					id: "1",
					title: "TypeScript 6 release notes",
					url: "https://example.com/1",
				},
				{ id: "2", title: "Sourdough tips", url: "https://example.com/2" },
			],
		});
		expect(result.success).toBe(true);
		const summarize = result.steps.find((s) => s.nodeType === "summarize");
		const out = summarize?.result.output as { digest: string; count: number };
		expect(out.count).toBe(1);
		expect(out.digest).toContain("TypeScript 6 release notes");
	});
});

describe("daily-content-publisher example", () => {
	it("deploys when quality clears the threshold", async () => {
		const result = await runDailyContentPublisher(
			{
				topics: ["typescript-tips"],
				repoUrl: "https://example.com/repo.git",
				qualityThreshold: 10,
			},
			{
				async generate() {
					return "# TypeScript tips\n\nA long, structured article about TypeScript tips and patterns.";
				},
			},
		);
		expect(result.success).toBe(true);
		const deploy = result.steps.find((s) => s.nodeType === "deploy-content");
		expect((deploy?.result.output as { deployed: boolean }).deployed).toBe(
			true,
		);
	});

	it("skips deploy when quality is too low", async () => {
		const result = await runDailyContentPublisher(
			{
				topics: ["x"],
				repoUrl: "https://example.com/repo.git",
				qualityThreshold: 90,
			},
			{
				async generate() {
					return "short";
				},
			},
		);
		const deploy = result.steps.find((s) => s.nodeType === "deploy-content");
		expect((deploy?.result.output as { deployed: boolean }).deployed).toBe(
			false,
		);
	});
});

describe("video-pipeline example", () => {
	it("runs all stages and uploads to the configured channel", async () => {
		const result = await runVideoPipeline({
			topic: "intro to typescript",
			channel: "my-channel",
		});
		expect(result.success).toBe(true);
		const publish = result.steps.find((s) => s.nodeType === "publish-video");
		const out = publish?.result.output as {
			uploaded: boolean;
			channel: string;
		};
		expect(out.uploaded).toBe(true);
		expect(out.channel).toBe("my-channel");
	});
});

describe("no example reintroduces the abuse surface", () => {
	const workflows = {
		community: buildCommunityResponderWorkflow({
			items: [],
			topic: "t",
			voice: "v",
		}),
		publisher: buildDailyContentPublisherWorkflow({
			topics: ["t"],
			repoUrl: "r",
		}),
		monitor: buildSourceMonitorWorkflow({ items: [], topics: ["t"] }),
		video: buildVideoPipelineWorkflow({ topic: "t", channel: "c" }),
	};

	for (const [name, wf] of Object.entries(workflows)) {
		it(`${name}: no autopost/persona/proxy/account node types`, () => {
			const types = Object.values(wf.steps)
				.map((s) => s.nodeType)
				.join(" ");
			expect(types).not.toMatch(
				/persona|proxy|sock|account|autopost|send.?dm|create.?tweet|retweet/i,
			);
		});
	}
});
