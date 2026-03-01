import { z } from 'zod';
import { defineNode } from '../../core/node.js';

export const approvalGateNode = defineNode({
  type: 'approval-gate',
  name: 'Approval Gate',
  description: 'Pauses workflow for human approval before continuing to the next step',
  category: 'logic',
  inputSchema: z.object({
    message: z.string(),
    nextNode: z.string(),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  capabilities: { supportsApproval: true },
  executor: async (input) => ({
    success: true,
    output: { message: input.message },
    approvalRequired: true,
    nextNode: input.nextNode,
  }),
});
