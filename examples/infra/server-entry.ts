import { serve } from '@hono/node-server';
import { WorkflowStore } from './workflow-store.js';
import { EmailNotifier } from './email-notifier.js';
import { createApprovalApp } from './approval-server.js';
import { NodeRegistry, builtInNodes } from 'pipewright';
import type { NodeDefinition } from 'pipewright';

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const store = new WorkflowStore(process.env.DB_PATH ?? 'workflows.db');

const emailNotifier = new EmailNotifier({
  smtpHost: requiredEnv('SMTP_HOST'),
  smtpPort: Number(process.env.SMTP_PORT ?? '587'),
  smtpUser: requiredEnv('SMTP_USER'),
  smtpPass: requiredEnv('SMTP_PASS'),
  fromAddress: requiredEnv('SMTP_FROM'),
  toAddress: requiredEnv('NOTIFY_TO'),
  approvalBaseUrl: requiredEnv('APPROVAL_BASE_URL'),
});

const registry = new NodeRegistry();
for (const node of builtInNodes) {
  registry.register(node as NodeDefinition);
}

const app = createApprovalApp({
  store,
  registry,
  services: { emailNotifier },
});

const port = Number(process.env.PORT ?? '3008');
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Approval server running on port ${info.port}`);
});
