import { z } from 'zod';
import { defineNode } from '../../core/node.js';

export const delayNode = defineNode({
  type: 'delay',
  name: 'Delay',
  description: 'Wait N milliseconds before continuing',
  category: 'logic',
  inputSchema: z.object({
    milliseconds: z.number().int().nonnegative(),
    nextNode: z.string().optional(),
  }),
  outputSchema: z.object({
    waited: z.number(),
  }),
  executor: async (input) => {
    await new Promise<void>((resolve) => setTimeout(resolve, input.milliseconds));
    return {
      success: true,
      output: { waited: input.milliseconds },
      nextNode: input.nextNode,
    };
  },
});
