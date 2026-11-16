# pipewright

[![CI](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml/badge.svg)](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

pipewright is a small TypeScript workflow engine. You write typed nodes and connect them into a workflow.
The core needs Zod only. pipewright merges the former dag-automation-kit.

## What it does

- It validates the input and the output of every node with Zod.
- It fills `{{stepId.field}}` templates with the output of earlier steps.
- It runs a workflow one step at a time, or a DAG in parallel waves.
- It pauses at an approval gate. A store keeps the run, and `resumeById` continues it.
- It retries, times out and caches a step when you configure it.
- It stops the run at the first failure. A failed node is never a silent skip.

```text
                     ┌────────────────┐
  workflow or DAG ──▶│     runner     │──▶ WorkflowResult
                     │ runWorkflow    │    success, steps[],
                     │ runDAGWorkflow │    error { code, message }
                     └───────┬────────┘
                             │ each step
                     ┌───────▼────────┐    ┌──────────────┐
                     │    runStep     │───▶│   registry   │──▶ node executor
                     │ interpolate,   │    │ Zod in / out │
                     │ cache, retry,  │    └──────────────┘
                     │ timeout        │
                     └───────┬────────┘
                             │ start, pause, error, done
                     ┌───────▼────────┐
                     │ WorkflowStore  │  memory or SQLite
                     └────────────────┘
```

## Example

```ts
import { z } from "zod";
import {
	builtInNodes,
	createExecutionContext,
	createRegistry,
	defineNode,
	runWorkflow,
} from "pipewright";

const greetNode = defineNode({
	type: "greet",
	name: "Greet",
	category: "action",
	inputSchema: z.object({ name: z.string() }),
	outputSchema: z.object({ message: z.string() }),
	executor: async (input) => ({
		success: true,
		output: { message: `Hello, ${input.name}!` },
		nextNode: "done",
	}),
});

const registry = createRegistry();
registry.registerAll(builtInNodes);
registry.register(greetNode);

const result = await runWorkflow(
	{
		start: { nodeType: "greet", input: { name: "{{config.userName}}" } },
		done: { nodeType: "end", input: { message: "{{start.message}}" } },
	},
	"start",
	registry,
	createExecutionContext({}, { config: { userName: "World" } }),
);

console.log(result.success, result.steps[1].result.output);
// true { message: 'Hello, World!', terminatedAt: '2026-...' }
```

## Node types

| Group                    | Node types                                                                                                                                                                                                                                       | Import from        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Logic                    | `approval-gate`, `conditional`, `delay`, `end`, `test-gate`, `webhook-trigger`                                                                                                                                                                   | `pipewright`       |
| Transform                | `map`, `filter`, `sort`                                                                                                                                                                                                                          | `pipewright`       |
| AI                       | `social-keyword-generator`, `social-ai-analyze`, `openrouter-generate`, `sora-video`, `elevenlabs-tts`                                                                                                                                           | `pipewright/nodes` |
| Web and search           | `http-request`, `rss-fetch`, `tavily-search`, `firecrawl-scrape`, `firecrawl-crawl`, `firecrawl-extract`, `apify-run-actor`, `apify-get-run-status`, `apify-get-dataset`, `youtube-search`, `youtube-channel-videos`, `unsplash-search`          | `pipewright/nodes` |
| SEO                      | `seo-keyword-research`, `seo-audit`, `dataforseo-backlinks`, `dataforseo-people-also-ask`, `dataforseo-serp`                                                                                                                                     | `pipewright/nodes` |
| Social (read-only)       | `reddit-monitor`, `twitter-monitor`, `twitter-search-tweets`, `twitter-get-user-by-username`                                                                                                                                                     | `pipewright/nodes` |
| Messaging and publishing | `discord-send-message`, `discord-send-webhook`, `discord-create-thread`, `devto-create-article`, `devto-update-article`, `devto-get-articles`, `wordpress-create-post`, `wordpress-update-post`, `wordpress-get-posts`, `wordpress-upload-media` | `pipewright/nodes` |
| Data                     | `google-sheets-read`, `google-sheets-append`, `google-sheets-update`, `google-sheets-clear`, `sqlite-query`, `file-read`, `file-write`                                                                                                           | `pipewright/nodes` |
| Local tools              | `git-operations`, `ssh-exec`, `ffmpeg-compose`                                                                                                                                                                                                   | `pipewright/nodes` |

Register the library with `registry.registerAll(integrationNodes)`. Nodes read API keys from the context
credentials, never from the environment. `pipewright/infra` holds the SQLite store, the approval server and an
e-mail notifier. The approval server is a demo without authentication. The run ID in each link is the only secret.

The engine, persistence, approval flow and design decisions: [pipewright in detail](docs/details.md).
Worked examples: [examples/](examples/).

## Breaking changes

This version breaks the old pipewright API:

- `WorkflowResult.error` is an object `{ code, message, stepId, nodeType }`. It was a string.
- `prepareWorkflow` and the resume cursor are gone. Use `runWorkflow`, `resumeWorkflow` or `resumeById`.
- `maxSteps` has no fixed default. The default is the number of steps, so a workflow that loops must set it.
- Node types of the former dag-automation-kit are kebab-case, for example `http-request`.

## Install and run

Install from a clone. The npm name `pipewright` belongs to an unrelated package.

```bash
git clone https://github.com/onblueroses/pipewright.git
cd pipewright
npm install
npm run build
npm run typecheck
npm run lint
npm test
npx tsx examples/dag-fan-out.ts
```

Node.js 22 or later is necessary. `sqlite-query` and `pipewright/infra` need the optional peer dependencies
`better-sqlite3`, `hono` and `nodemailer`. `npm install` in the clone installs them.

## Layout

```text
src/core/    engine: registry, context, step executor, runners, stores, cost
src/nodes/   logic and transform nodes, and the node library (pipewright/nodes)
src/infra/   SQLite store, approval server, e-mail notifier, exec service
examples/    worked examples
tests/       tests
docs/        notes for readers
```

## License

[MIT](LICENSE)
