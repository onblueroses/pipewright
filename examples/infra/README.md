# Infra Reference Implementation

Reference implementation for persisting and managing pipewright workflows in production. Includes:

- **WorkflowStore** - SQLite persistence for workflow state (pause, resume, complete)
- **EmailNotifier** - SMTP email notifications for approval gates
- **ApprovalServer** - Hono HTTP server with `/approve/:id`, `/reject/:id`, `/pending`, `/health` endpoints
- **server-entry** - PM2-compatible entry point wiring everything together

## Setup

```bash
cd examples/infra
npm install
```

## Usage

Copy and adapt these files for your deployment. The `pipewright` dependency uses `file:../../` to reference the local package - replace with the npm version in production.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DB_PATH` | SQLite database path (default: `workflows.db`) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default: `587`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | Sender email address |
| `NOTIFY_TO` | Recipient email for approval notifications |
| `APPROVAL_BASE_URL` | Base URL for approve/reject links in emails |
| `PORT` | HTTP server port (default: `3008`) |
