import type { NodeDefinition } from './types.js';

export function defineNode<TInput, TOutput>(
  definition: NodeDefinition<TInput, TOutput>
): NodeDefinition<TInput, TOutput> {
  return definition;
}
