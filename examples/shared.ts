/**
 * Shared types for the examples.
 *
 * `LlmService` is an optional service the example workflows use for text
 * generation when present, falling back to a deterministic stub otherwise. This
 * keeps the examples runnable offline while showing exactly where a real provider
 * SDK (OpenRouter, Anthropic, etc.) plugs in.
 */

/** Minimal text-generation service the examples optionally use. */
export interface LlmService {
	generate(prompt: string): Promise<string>;
}

// Make the `llm` service available on the engine's injected services.
declare module "pipewright" {
	interface NodeServices {
		llm?: LlmService;
	}
}
