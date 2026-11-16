/**
 * Example: daily content publisher.
 *
 * Pipeline (linear): pick -> write -> grade -> deploy
 *
 * Picks a topic, generates a draft, scores its quality, and "deploys" only if the
 * score clears a threshold. The write step uses the optional `llm` service when
 * present (else a deterministic stub); the deploy step is a stand-in — swap it for
 * `gitOperationsNode` to commit/push to a real content repo.
 */

import {
	createExecutionContext,
	createRegistry,
	defineNode,
	endNode,
	type NodeRegistry,
	runWorkflow,
	type WorkflowResult,
	type WorkflowStep,
} from "pipewright";
import { z } from "zod";
import type { LlmService } from "./shared.js";

const pickTopicNode = defineNode({
	type: "pick-topic",
	name: "Pick Topic",
	category: "action",
	inputSchema: z.object({ topics: z.array(z.string()), nextNode: z.string() }),
	outputSchema: z.object({ topic: z.string() }),
	executor: async (input) => ({
		success: true,
		output: { topic: input.topics[0] ?? "untitled" },
		nextNode: input.nextNode,
	}),
});

const writeNode = defineNode({
	type: "write-content",
	name: "Write Content",
	category: "action",
	inputSchema: z.object({
		topic: z.string(),
		angle: z.string().optional(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ content: z.string() }),
	executor: async (input, context) => {
		const prompt = `Write a short article about "${input.topic}"${
			input.angle ? ` from this angle: ${input.angle}` : ""
		}.`;
		const llm = context.services.llm;
		const content = llm
			? await llm.generate(prompt)
			: `# ${input.topic}\n\nA short, useful piece about ${input.topic}.`;
		return { success: true, output: { content }, nextNode: input.nextNode };
	},
});

const gradeNode = defineNode({
	type: "grade-content",
	name: "Grade Content",
	category: "action",
	inputSchema: z.object({
		content: z.string(),
		threshold: z.number(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ quality: z.number(), passed: z.boolean() }),
	executor: async (input) => {
		// Illustrative heuristic: longer, structured drafts score higher.
		const quality = Math.min(
			100,
			Math.round(input.content.length / 5) +
				(input.content.includes("#") ? 20 : 0),
		);
		return {
			success: true,
			output: { quality, passed: quality >= input.threshold },
			nextNode: input.nextNode,
		};
	},
});

const deployNode = defineNode({
	type: "deploy-content",
	name: "Deploy Content",
	category: "action",
	inputSchema: z.object({
		content: z.string(),
		passed: z.boolean(),
		repoUrl: z.string(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ deployed: z.boolean() }),
	executor: async (input) => {
		// Swap for gitOperationsNode: commit `content` to `repoUrl` and push.
		return {
			success: true,
			output: { deployed: input.passed },
			nextNode: input.nextNode,
		};
	},
});

export interface DailyContentPublisherConfig {
	topics: string[];
	angle?: string;
	repoUrl: string;
	qualityThreshold?: number;
}

export function createDailyContentPublisherRegistry(): NodeRegistry {
	const registry = createRegistry();
	registry.register(pickTopicNode);
	registry.register(writeNode);
	registry.register(gradeNode);
	registry.register(deployNode);
	registry.register(endNode);
	return registry;
}

export function buildDailyContentPublisherWorkflow(
	config: DailyContentPublisherConfig,
): { startNode: string; steps: Record<string, WorkflowStep> } {
	return {
		startNode: "pick",
		steps: {
			pick: {
				nodeType: "pick-topic",
				input: { topics: config.topics, nextNode: "write" },
			},
			write: {
				nodeType: "write-content",
				input: {
					topic: "{{pick.topic}}",
					angle: config.angle,
					nextNode: "grade",
				},
			},
			grade: {
				nodeType: "grade-content",
				input: {
					content: "{{write.content}}",
					threshold: config.qualityThreshold ?? 40,
					nextNode: "deploy",
				},
			},
			deploy: {
				nodeType: "deploy-content",
				input: {
					content: "{{write.content}}",
					passed: "{{grade.passed}}",
					repoUrl: config.repoUrl,
					nextNode: "done",
				},
			},
			done: { nodeType: "end", input: { message: "Publish run complete." } },
		},
	};
}

export async function runDailyContentPublisher(
	config: DailyContentPublisherConfig,
	llm?: LlmService,
): Promise<WorkflowResult> {
	const registry = createDailyContentPublisherRegistry();
	const context = createExecutionContext(llm ? { llm } : {});
	const { steps, startNode } = buildDailyContentPublisherWorkflow(config);
	return runWorkflow(steps, startNode, registry, context);
}
