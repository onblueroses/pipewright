# pipewright

[![CI](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml/badge.svg)](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pipewright)](https://www.npmjs.com/package/pipewright)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lightweight TypeScript workflow engine with typed nodes, context interpolation, and human-in-the-loop approval gates.

Most workflow engines are either too heavy (Temporal, Inngest) or too simple (just chain promises). pipewright is ~1,000 lines of TypeScript with a single runtime dependency (Zod). Define typed nodes, wire them into a workflow, and let the engine handle branching, interpolation, and pause/resume for human approval.

## Architecture

```
                    ┌─────────────────────────┐
                    │       Registry          │
                    │  register(node)          │
                    │  execute(type, input)    │
                    └──────────┬──────────────┘
                               │
  ┌────────────┐    ┌──────────▼──────────────┐    ┌──────────────┐
  │ defineNode │───▶│    Workflow Runner       │───▶│ WorkflowResult│
  │  (factory) │    │  runWorkflow(steps,...)  │    │  steps[]      │
  └────────────┘    │  resumeWorkflow(...)     │    │  pausedAt?    │
                    └──────────┬──────────────┘    └──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │   ExecutionContext       │
                    │  {{stepId.field}} interp │
                    │  dot-path + array index  │
                    │  services injection      │
                    └─────────────────────────┘
```

The runner walks the graph one node at a time, following `nextNode` pointers. Conditional nodes enable branching (one step, two possible paths), but execution is sequential - there is no parallel fan-out. This keeps the engine simple and deterministic.

## Install

```bash
npm install pipewright
```

## Quick Example

```ts
import { z } from 'zod';
import { defineNode, createRegistry, createExecutionContext, runWorkflow, builtInNodes } from 'pipewright';

// Define a custom node
const greetNode = defineNode({
  type: 'greet',
  name: 'Greet',
  category: 'action',
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ message: z.string() }),
  executor: async (input) => ({
    success: true,
    output: { message: `Hello, ${input.name}!` },
    nextNode: 'done',
  }),
});

// Register and run
const registry = createRegistry();
registry.registerAll(builtInNodes);
registry.register(greetNode);

const ctx = createExecutionContext({}, { config: { userName: 'World' } });

const result = await runWorkflow({
  start: { nodeType: 'greet', input: { name: '{{config.userName}}' } },
  done: { nodeType: 'end', input: { message: '{{start.message}}' } },
}, 'start', registry, ctx);

console.log(result.steps[1].result.output);
// { message: 'Hello, World!', terminatedAt: '2026-...' }
```

## Core Concepts

- **Node** - unit of work with Zod-validated input/output schemas and an async executor. Four categories: `action`, `logic`, `transform`, `integration`.
- **Registry** - catalog of nodes. Validates schemas at execution boundaries. Separates metadata (safe for frontend) from executors (server-only).
- **ExecutionContext** - threads data between nodes via `{{stepId.field}}` interpolation. Supports dot-notation, array indexing (`items[0].name`), and service injection.
- **Workflow** - a map of step IDs to `{ nodeType, input }`. The runner follows `nextNode` from each result. Conditional nodes enable branching. Halts on error or approval gate.

## Context and Interpolation

Node output is stored under the **step ID** (the key in the workflow map), not the node type. Reference it with `{{stepId.field}}`:

```ts
const steps = {
  fetch:   { nodeType: 'http-get', input: { url: '{{config.apiUrl}}' } },
  process: { nodeType: 'transform', input: { data: '{{fetch.body}}' } },
  //                                               ^^^^^ step ID, not node type
};
```

```ts
// Single-var: returns the actual value (array, object, number)
{ data: '{{fetch.items}}' }     // -> { data: [{ id: 1 }, { id: 2 }] }

// Multi-var: returns a formatted string
{ label: '{{fetch.count}} items from {{config.source}}' }

// Dot-notation + array index
{ first: '{{fetch.items[0].name}}' }
```

Unknown paths are left as-is. Single-variable templates preserve the original type (not stringified), which is how arrays and objects flow between nodes.

## Built-in Nodes

| Node | Category | Description |
|------|----------|-------------|
| `conditional` | logic | Branch on a context variable condition (equals, greater_than, contains, exists, and negations) |
| `delay` | logic | Wait N milliseconds before continuing |
| `end` | logic | Explicit terminal node - halts the workflow |
| `approval-gate` | logic | Pause for human approval before continuing |
| `map` | transform | Map array items through an object template with `{{item.field}}` |
| `test-gate` | logic | Run a command via injected ExecService, branch on exit code (0 = pass, non-zero = fail) |
| `filter` | transform | Filter an array by evaluating a condition on each item |

## Approval Gates

The `approval-gate` node pauses workflow execution for human review. Use `resumeWorkflow` to continue after approval:

```ts
const result = await runWorkflow(steps, 'start', registry, ctx);

if (result.pausedAt) {
  // Persist result + context.snapshot() to your database
  // Later, after human approves:
  const resumed = await resumeWorkflow(result, steps, registry, ctx);
}
```

The context is preserved across pause/resume - downstream nodes can still interpolate values from earlier steps. See `examples/infra/` for a full persistence + HTTP approval implementation.

## Step Events

Monitor execution with the `onStep` callback. Both sync and async callbacks are supported:

```ts
const result = await runWorkflow(steps, 'start', registry, ctx, {
  onStep: async (event) => {
    await db.insert('step_log', {
      stepId: event.stepId,
      nodeType: event.nodeType,
      success: event.result.success,
      durationMs: event.durationMs,
    });
  },
});
```

## Design Decisions

**No built-in persistence.** The core engine is stateless. `snapshot()` and `ExecutionContext.fromJSON()` give you the serialization boundary - wire your own storage. The `examples/infra/` directory shows a full SQLite + HTTP approval implementation in ~150 lines.

**Sequential execution.** The runner follows one `nextNode` at a time. Conditional nodes branch (pick path A or path B), but there is no parallel fan-out where two independent paths run concurrently. This keeps execution deterministic and the engine simple.

**String errors.** `WorkflowResult.error` is a human-readable string. The structured context (which step failed, which node type, the full execution trace) is already in `WorkflowResult.steps` - the last entry before failure has the step ID, node type, and result.

## Examples

- [`examples/content-pipeline/`](examples/content-pipeline/) - fetch -> extract -> quality check -> format -> review -> publish
- [`examples/infra/`](examples/infra/) - SQLite persistence, SMTP email notifications, Hono HTTP approval server, child_process ExecService
- [`examples/orchestrator-pattern/`](examples/orchestrator-pattern/) - verify-then-fix loop with test-gate and conditional retry

## License

MIT
