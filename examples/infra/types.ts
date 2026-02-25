import type { WorkflowResult, WorkflowStep } from 'pipewright';

export type WorkflowStatus = 'paused' | 'approved' | 'rejected' | 'completed' | 'error';

export interface WorkflowRecord {
  id: string;
  status: WorkflowStatus;
  workflowResult: WorkflowResult;
  contextSnapshot: Record<string, unknown>;
  steps: Record<string, WorkflowStep>;
  startNode: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EmailNotifierService {
  sendApproval(params: {
    workflowId: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

declare module 'pipewright' {
  interface NodeServices {
    emailNotifier?: EmailNotifierService;
  }
}
