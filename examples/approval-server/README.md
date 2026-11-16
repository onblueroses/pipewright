# Approval server

A small HTTP server for approval gates. It uses `SqliteWorkflowStore`, `EmailNotifier` and
`createApprovalApp` from `pipewright/infra`.

A workflow that runs with `{ store }` and the `approvalNotifier` service pauses at an approval
gate. The notifier sends the reviewer an e-mail with two links. A link opens a confirm form. The
form sends a POST, and the server resumes or rejects the run. A second approval of the same run
gets HTTP 409.

| Variable                                           | Use                                                  |
| -------------------------------------------------- | ---------------------------------------------------- |
| `DB_PATH`                                          | SQLite file (default `workflows.db`)                 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP server (port default `587`)                     |
| `SMTP_FROM`, `NOTIFY_TO`                           | Sender and reviewer addresses                        |
| `APPROVAL_BASE_URL`                                | Base URL of this server, for the links in the e-mail |
| `PORT`                                             | HTTP port (default `3008`)                           |

```bash
npm run build
npx tsx examples/approval-server/server.ts
```

The run ID in the link is the only secret. Put the server behind your own authentication.
