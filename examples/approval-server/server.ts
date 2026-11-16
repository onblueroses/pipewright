/**
 * Approval server: SQLite store, e-mail notifier and the approve/reject endpoints.
 *
 * Run: npm run build && npx tsx examples/approval-server/server.ts
 * Settings come from the environment. See examples/approval-server/README.md.
 */
import { serve } from "@hono/node-server";
import { builtInNodes, createRegistry } from "pipewright";
import {
	createApprovalApp,
	EmailNotifier,
	SqliteWorkflowStore,
} from "pipewright/infra";

function requiredEnv(key: string): string {
	const value = process.env[key];
	if (!value) throw new Error(`Missing required environment variable ${key}`);
	return value;
}

const store = new SqliteWorkflowStore(process.env.DB_PATH ?? "workflows.db");
const approvalNotifier = new EmailNotifier({
	smtpHost: requiredEnv("SMTP_HOST"),
	smtpPort: Number(process.env.SMTP_PORT ?? "587"),
	smtpUser: requiredEnv("SMTP_USER"),
	smtpPass: requiredEnv("SMTP_PASS"),
	fromAddress: requiredEnv("SMTP_FROM"),
	toAddress: requiredEnv("NOTIFY_TO"),
	approvalBaseUrl: requiredEnv("APPROVAL_BASE_URL"),
});

// Register the same nodes as the workflows that pause on this server.
const registry = createRegistry();
registry.registerAll(builtInNodes);

const app = createApprovalApp({
	store,
	registry,
	services: { approvalNotifier },
});
const port = Number(process.env.PORT ?? "3008");
serve({ fetch: app.fetch, port }, (info) => {
	console.log(`Approval server on port ${info.port}`);
});
