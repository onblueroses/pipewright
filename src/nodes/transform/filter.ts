import { z } from 'zod';
import { defineNode } from '../../core/node.js';
import { createExecutionContext } from '../../core/context.js';
import { evaluate, CONDITION_TYPES } from '../shared/evaluate.js';

export const filterNode = defineNode({
  type: 'filter',
  name: 'Filter',
  description: 'Filter an array by evaluating a condition on each item',
  category: 'transform',
  inputSchema: z.object({
    items: z.array(z.unknown()),
    variable: z.string(),
    condition: z.enum(CONDITION_TYPES),
    value: z.unknown().optional(),
    nextNode: z.string().optional(),
  }),
  outputSchema: z.object({
    items: z.array(z.unknown()),
    count: z.number(),
    filtered: z.number(),
  }),
  executor: async (input, context) => {
    const filtered = input.items.filter((item) => {
      const childCtx = createExecutionContext(context.services, {
        ...context.snapshot(),
        item,
      });
      const resolved = childCtx.get(`item.${input.variable}`);
      return evaluate(input.condition, resolved, input.value);
    });
    return {
      success: true,
      output: {
        items: filtered,
        count: filtered.length,
        filtered: input.items.length - filtered.length,
      },
      nextNode: input.nextNode,
    };
  },
});
