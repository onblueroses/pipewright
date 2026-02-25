import { z } from 'zod';
import { defineNode } from '../../core/node.js';

export const endNode = defineNode({
  type: 'end',
  name: 'End',
  description: 'Explicit terminal node - halts workflow execution',
  category: 'logic',
  inputSchema: z.object({
    message: z.string().optional(),
  }),
  outputSchema: z.object({
    message: z.string().optional(),
    terminatedAt: z.string(),
  }),
  executor: async (input) => ({
    success: true,
    output: {
      message: input.message,
      terminatedAt: new Date().toISOString(),
    },
  }),
});
