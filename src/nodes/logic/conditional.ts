import { z } from 'zod';
import { defineNode } from '../../core/node.js';
import { evaluate, CONDITION_TYPES } from '../shared/evaluate.js';

const inputSchema = z.object({
  variable: z.string(),
  condition: z.enum(CONDITION_TYPES),
  value: z.unknown().optional(),
  trueNode: z.string(),
  falseNode: z.string(),
});

const outputSchema = z.object({
  matched: z.boolean(),
  variable: z.string(),
  resolvedValue: z.unknown(),
});

export const conditionalNode = defineNode({
  type: 'conditional',
  name: 'Conditional',
  description: 'Branch workflow execution based on a context variable condition',
  category: 'logic',
  inputSchema,
  outputSchema,
  executor: async (input, context) => {
    const resolved = context.get(input.variable);
    const matched = evaluate(input.condition, resolved, input.value);
    return {
      success: true,
      output: { matched, variable: input.variable, resolvedValue: resolved },
      nextNode: matched ? input.trueNode : input.falseNode,
    };
  },
});
