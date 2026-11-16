import type { NodeDefinition } from "./types.js";

/** Identity helper that infers the input and output types from the schemas. */
export function defineNode<TInput, TOutput>(
	definition: NodeDefinition<TInput, TOutput>,
): NodeDefinition<TInput, TOutput> {
	return definition;
}
