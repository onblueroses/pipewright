import { z } from 'zod';
import { defineNode } from '../../core/node.js';
import { createExecutionContext } from '../../core/context.js';

export const mapNode = defineNode({
  type: 'map',
  name: 'Map',
  description: 'Map each item in an array through an object template with {{item.field}} interpolation',
  category: 'transform',
  inputSchema: z.object({
    items: z.array(z.unknown()),
    template: z.record(z.unknown()),
    nextNode: z.string().optional(),
  }),
  outputSchema: z.object({
    items: z.array(z.unknown()),
    count: z.number(),
  }),
  executor: async (input, context) => {
    const mappedItems = input.items.map((item) => {
      const childCtx = createExecutionContext(context.services, {
        ...context.snapshot(),
        item,
      });
      return childCtx.interpolateObject(input.template as Record<string, unknown>);
    });
    return {
      success: true,
      output: { items: mappedItems, count: mappedItems.length },
      nextNode: input.nextNode,
    };
  },
});
