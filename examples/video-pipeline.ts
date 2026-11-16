/**
 * Example: video pipeline.
 *
 * Pipeline (linear): script -> slides -> tts -> compose -> publish
 *
 * Turns a topic into a narrated slide video and uploads it to your own channel.
 * Every node here is an illustrative stand-in so the example runs offline; swap
 * them for real nodes in production:
 *   - tts     -> `elevenlabsTtsNode`
 *   - compose -> `ffmpegComposeNode`
 *   - publish -> a YouTube upload node (uploads to the channel you own)
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

const scriptNode = defineNode({
	type: "write-script",
	name: "Write Script",
	category: "action",
	inputSchema: z.object({ topic: z.string(), nextNode: z.string() }),
	outputSchema: z.object({ script: z.string() }),
	executor: async (input, context) => {
		const llm = context.services.llm;
		const script = llm
			? await llm.generate(
					`Write a 60-second narration about "${input.topic}".`,
				)
			: `Today we cover ${input.topic}. Here is what matters and why.`;
		return { success: true, output: { script }, nextNode: input.nextNode };
	},
});

const slidesNode = defineNode({
	type: "render-slides",
	name: "Render Slides",
	category: "action",
	inputSchema: z.object({ script: z.string(), nextNode: z.string() }),
	outputSchema: z.object({ slides: z.array(z.string()) }),
	executor: async (input) => {
		const slides = input.script
			.split(/(?<=[.!?])\s+/)
			.filter(Boolean)
			.map((line, i) => `slide-${i + 1}: ${line}`);
		return { success: true, output: { slides }, nextNode: input.nextNode };
	},
});

const ttsNode = defineNode({
	type: "tts",
	name: "Text To Speech",
	category: "action",
	inputSchema: z.object({ script: z.string(), nextNode: z.string() }),
	outputSchema: z.object({ audioPath: z.string() }),
	executor: async (input) => {
		// Swap for elevenlabsTtsNode: synthesize `script` to an audio file.
		return {
			success: true,
			output: { audioPath: `/tmp/narration-${input.script.length}.wav` },
			nextNode: input.nextNode,
		};
	},
});

const composeNode = defineNode({
	type: "compose-video",
	name: "Compose Video",
	category: "action",
	inputSchema: z.object({
		slides: z.array(z.string()),
		audioPath: z.string(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ videoPath: z.string() }),
	executor: async (input) => {
		// Swap for ffmpegComposeNode: render slides + audio into an mp4.
		return {
			success: true,
			output: { videoPath: `/tmp/video-${input.slides.length}slides.mp4` },
			nextNode: input.nextNode,
		};
	},
});

const publishNode = defineNode({
	type: "publish-video",
	name: "Publish Video",
	category: "action",
	inputSchema: z.object({
		videoPath: z.string(),
		channel: z.string(),
		nextNode: z.string(),
	}),
	outputSchema: z.object({ uploaded: z.boolean(), channel: z.string() }),
	executor: async (input) => {
		// Swap for a YouTube upload node. Uploads to the channel you own.
		return {
			success: true,
			output: { uploaded: true, channel: input.channel },
			nextNode: input.nextNode,
		};
	},
});

export interface VideoPipelineConfig {
	topic: string;
	/** Channel identifier you own and upload to. */
	channel: string;
}

export function createVideoPipelineRegistry(): NodeRegistry {
	const registry = createRegistry();
	registry.register(scriptNode);
	registry.register(slidesNode);
	registry.register(ttsNode);
	registry.register(composeNode);
	registry.register(publishNode);
	registry.register(endNode);
	return registry;
}

export function buildVideoPipelineWorkflow(config: VideoPipelineConfig): {
	startNode: string;
	steps: Record<string, WorkflowStep>;
} {
	return {
		startNode: "write",
		steps: {
			write: {
				nodeType: "write-script",
				input: { topic: config.topic, nextNode: "deck" },
			},
			deck: {
				nodeType: "render-slides",
				input: { script: "{{write.script}}", nextNode: "tts" },
			},
			tts: {
				nodeType: "tts",
				input: { script: "{{write.script}}", nextNode: "compose" },
			},
			compose: {
				nodeType: "compose-video",
				input: {
					slides: "{{deck.slides}}",
					audioPath: "{{tts.audioPath}}",
					nextNode: "publish",
				},
			},
			publish: {
				nodeType: "publish-video",
				input: {
					videoPath: "{{compose.videoPath}}",
					channel: config.channel,
					nextNode: "done",
				},
			},
			done: { nodeType: "end", input: { message: "Video published." } },
		},
	};
}

export async function runVideoPipeline(
	config: VideoPipelineConfig,
	llm?: LlmService,
): Promise<WorkflowResult> {
	const registry = createVideoPipelineRegistry();
	const context = createExecutionContext(llm ? { llm } : {});
	const { steps, startNode } = buildVideoPipelineWorkflow(config);
	return runWorkflow(steps, startNode, registry, context);
}
