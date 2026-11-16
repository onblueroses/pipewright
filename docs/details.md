# pipewright in detail

This page holds the longer explanation behind the [README](../README.md).

Many workflow engines are either large (Temporal, Inngest) or very small (a chain of promises). pipewright is a
small TypeScript engine with a single runtime dependency (Zod). You define typed nodes and connect them into a
workflow. The engine does the branching, the interpolation, and the pause and resume for human approval.

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

The runner moves through the graph one node at a time and follows the `nextNode` pointers. Conditional nodes
make branches (one step, two possible paths), but execution is sequential. There is no parallel fan-out. This
keeps the engine simple and deterministic.

## Core concepts

- **Node**: a unit of work with Zod-validated input and output schemas and an async executor. There are four
  categories: `action`, `logic`, `transform`, `integration`.
- **Registry**: a catalog of nodes. It validates schemas at execution boundaries. It keeps metadata (safe for a
  frontend) separate from executors (server only).
- **ExecutionContext**: moves data between nodes through `{{stepId.field}}` interpolation. It supports dot
  notation, array indexes (`items[0].name`) and service injection.
- **Workflow**: a map of step IDs to `{ nodeType, input }`. The runner follows `nextNode` from each result.
  Conditional nodes make branches. The runner stops on an error or at an approval gate.

## Context and interpolation

The engine stores node output under the **step ID** (the key in the workflow map), not under the node type.
Refer to it with `{{stepId.field}}`:

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

The engine leaves unknown paths as they are. A template with a single variable keeps the original type and does
not change it to a string. This is how arrays and objects move between nodes.

## Approval gates

The `approval-gate` node pauses the workflow for human review. Use `resumeWorkflow` to continue after approval:

```ts
const result = await runWorkflow(steps, 'start', registry, ctx);

if (result.pausedAt) {
  // Persist result + context.snapshot() to your database
  // Later, after human approves:
  const resumed = await resumeWorkflow(result, steps, registry, ctx);
}
```

The context stays the same across pause and resume. Later nodes can still interpolate values from earlier steps.
`examples/infra/` has a full implementation of persistence and HTTP approval.

## Step events

Use the `onStep` callback to monitor execution. The callback can be sync or async:

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

## Design decisions

**No built-in persistence.** The core engine has no state. `snapshot()` and `ExecutionContext.fromJSON()` give
the serialization boundary, and you connect your own storage. The `examples/infra/` directory shows a full
SQLite and HTTP approval implementation. Its store and approval server together are about 160 lines.

**Sequential execution.** The runner follows one `nextNode` at a time. Conditional nodes branch (path A or path
B), but no two independent paths run at the same time. This keeps execution deterministic and the engine simple.

**String errors.** `WorkflowResult.error` is a string for humans. The structured context (the step that failed,
its node type, the full execution trace) is already in `WorkflowResult.steps`. The last entry before the failure
has the step ID, the node type and the result.

## Examples

- [`examples/content-pipeline/`](../examples/content-pipeline/): fetch, extract, quality check, format, review, publish
- [`examples/infra/`](../examples/infra/): SQLite persistence, SMTP email notifications, Hono HTTP approval server, child_process ExecService
- [`examples/orchestrator-pattern/`](../examples/orchestrator-pattern/): verify-then-fix loop with test-gate and conditional retry
