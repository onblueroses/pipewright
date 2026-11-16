# pipewright in detail

This page holds the longer explanation behind the [README](../README.md).

## Core concepts

- **Node**: a unit of work. `defineNode()` takes a type, a category, a Zod input schema, a Zod output schema
  and an async executor. The categories are `action`, `logic`, `transform` and `integration`.
- **Registry**: a catalog of nodes. `registry.execute()` parses the input, runs the executor and parses the
  output. The result carries the parsed output, so schema defaults and transforms apply.
- **ExecutionContext**: holds the output of each step under its step ID. It also carries the injected services
  and credentials. Inject services such as an LLM client. Do not import them inside a node.
- **Step executor**: `runStep()` runs one step for both runners. It interpolates the input, uses the cache,
  applies retries and the timeout, and turns every error into a failed outcome.
- **Store**: a `WorkflowStore` saves a sequential run. `createMemoryStore()` is for tests.
  `SqliteWorkflowStore` from `pipewright/infra` is for one server.

## Two runners

|                    | `runWorkflow`                                             | `runDAGWorkflow`                              |
| ------------------ | --------------------------------------------------------- | --------------------------------------------- |
| Input              | a map of `stepId -> { nodeType, input }` and a start step | nodes and edges                               |
| Order              | each result names the next step with `nextNode`           | edges, in waves                               |
| Parallel           | no                                                        | yes, all nodes of a wave run at the same time |
| Branches and loops | yes, through `nextNode`                                   | no                                            |
| Approval gates     | yes                                                       | no, a gate fails the run                      |
| Store and resume   | yes                                                       | no                                            |

Both runners check the workflow before the first step. An unknown node type or a missing start step gives
`INVALID_WORKFLOW`. The DAG check also finds duplicate IDs, self-edges, missing endpoints and cycles.

In a DAG the edges set the order. A node that returns `nextNode` or asks for approval fails the run with
`INVALID_WORKFLOW`. Use `runWorkflow` for gates and branches.

`runWorkflow` stops with `MAX_STEPS_EXCEEDED` when the run takes more steps than `maxSteps`. Without
`maxSteps`, the bound is the number of steps in the workflow. A run without a loop visits each step at most
once, so it never needs more. A workflow that loops through `nextNode` must set `maxSteps`. Derive it from the
loop: steps before the loop, plus the steps of one round times the largest number of rounds.
[examples/orchestrator-pattern](../examples/orchestrator-pattern/) shows this.

## Context and interpolation

The engine stores the output of a step under its step ID, not under the node type. Refer to it with
`{{stepId.field}}`:

```ts
const steps = {
	fetch: { nodeType: "http-request", input: { url: "{{config.apiUrl}}" } },
	parse: {
		nodeType: "map",
		input: { items: "{{fetch.body.items}}", template: { id: "{{item.id}}" } },
	},
	//                                          ^^^^^ step ID, not node type
};
```

A template that is exactly one `{{path}}` keeps the type of the value. That is how arrays and objects move
between nodes. A template with text around the reference gives a string. Paths support dots and array indexes,
for example `{{fetch.items[0].name}}`. The engine leaves an unknown path as written. The input schema of the
next node then rejects the value.

## Failures

Every failure ends the run. The trace in `result.steps` always ends with the step that failed.
`result.error` has a `code`, a `message`, and the `stepId` and `nodeType` when they apply.

| Code                 | Cause                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `INVALID_WORKFLOW`   | the check before the run failed, or a DAG node branched or asked for approval |
| `STEP_NOT_FOUND`     | a `nextNode` names a step that is not in the workflow                         |
| `VALIDATION_ERROR`   | the input or the output of a node does not match its schema                   |
| `NODE_FAILED`        | the executor returned `success: false`                                        |
| `NODE_THREW`         | the executor threw, or the step timed out                                     |
| `BUDGET_EXCEEDED`    | the cost tracker reached its hard limit                                       |
| `MAX_STEPS_EXCEEDED` | the run took more steps than `maxSteps`                                       |
| `RESUME_INVALID`     | the run to resume is missing, or it is not paused                             |

A successful result must have valid output. A node that returns `success: true` without output that matches
its schema fails with `VALIDATION_ERROR`.

The integration nodes call `fetchWithRetry`. By default it makes one attempt with no timeout. With
`maxRetries` above 1, it retries 429, 5xx, timeouts and network errors. A 429 waits for the `Retry-After` time
that the service sends. It throws on every other non-2xx status, so an error body never passes as empty data. The error message has the origin and
path of the URL only, because a query string can hold an API key and errors are persisted. `http-request` has
`allowHttpErrors` for workflows that branch on the status.

## Execution settings

Set retries, a timeout and caching per node type or per step ID. A step ID setting wins:

```ts
await runWorkflow(steps, "start", registry, context, {
	cacheStore: createMemoryCacheStore(),
	nodeConfig: {
		"http-request": { retryCount: 2, retryDelayMs: 500, timeoutMs: 10_000 },
		summarize: { cacheTtlMs: 60_000 },
	},
});
```

A retry follows a thrown error only. A result with `success: false` is final. A timeout is final too, because
the first attempt can still be running. The engine has no built-in retry count, retry delay or timeout. The
values in the example above are placeholders. Take yours from the limits that each service documents.

## Approval gates and persistence

The `approval-gate` node pauses `runWorkflow`. The result has `success: true` and `pausedAt`. Continue in the
same process with `resumeWorkflow(result, steps, registry, context)`.

To continue in another process, give the run a store:

```ts
const store = createMemoryStore(); // or new SqliteWorkflowStore("workflows.db")
const paused = await runWorkflow(steps, "draft", registry, context, { store });

// Later, after a person approves:
const done = await resumeById(paused.id!, registry, {
	store,
	services,
	credentials,
});
```

The runner saves the run when it starts, pauses, fails and completes. The saved state has the step trace and a
deep copy of the context variables. It does not hold services or credentials, so pass them again on resume.
`resumeById` moves the run from `paused` to `running` in one atomic step. A second approval of the same run
fails with `RESUME_INVALID`.

With an `approvalNotifier` service, the gate tells a reviewer before it pauses. `EmailNotifier` from
`pipewright/infra` sends approve and reject links. `createApprovalApp` serves them. A link opens a confirm form,
and only the POST acts, because mail scanners open links. See
[examples/approval-server](../examples/approval-server/).

## Step events and cost

`onStep` gets an event after every step, also a failed one. The runner awaits it, so an async logger finishes
before the next step starts. The event has the result, the duration, a `cached` flag and the cost of the step.

`createCostTracker` records token use and money per step and per model. `wrapLLMService` wraps a client so that
each call checks the budget first and records its usage. The runners run each step inside
`tracker.runInStep(stepId, ...)`. That uses `AsyncLocalStorage`, so concurrent DAG nodes keep separate costs.
At the hard limit, the step fails with `BUDGET_EXCEEDED`. See
[examples/cost-tracked-workflow.ts](../examples/cost-tracked-workflow.ts).

## Design decisions

**One step executor.** Both runners call `runStep`. Validation, retries, timeouts, the cache and cost
attribution therefore behave the same in both.

**Parallel work in the DAG runner only.** The former `parallel` node forked the context inside the sequential
runner. It did the same job as the DAG runner, with more rules. The DAG runner is the simpler way.

**Fail closed.** A node failure ends the run. A node that cannot read a response fails. It never returns empty
data. The DAG runner rejects branches and gates instead of ignoring them.

**Small entries.** `pipewright` needs Zod only. The node library is in `pipewright/nodes`. The SQLite store and
the approval server are in `pipewright/infra`. Their packages are optional peer dependencies.

**Kebab-case node types.** Every node type is lowercase words with hyphens, for example `google-sheets-read`.

## History

pipewright merges the former dag-automation-kit (2026-11-16). That repo contributed the DAG runner, the store,
structured errors, credentials, the node library and four examples. pipewright contributed the sequential
runner with async step events, `test-gate` and its examples. These parts were dropped:

- the Gondolin sandbox executor, because it did not run the node executor. It ran a generic curl command.
- the `parallel`, `retry` and `rate_limiter` nodes. The DAG runner and `retryCount` do their jobs.
- `RateLimitStore` and the fetch cache, because no node used them.
- declarative credential metadata, because each node checks its own keys.
- `prepareWorkflow` and the resume cursor. `runWorkflow` now checks the workflow, and `resumeById` resumes by ID.
