# pipewright

[![CI](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml/badge.svg)](https://github.com/onblueroses/pipewright/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

pipewright is a small TypeScript workflow engine with typed nodes, context interpolation and human approval gates.
Its only runtime dependency is Zod.

## What it does

You define typed nodes and connect them into a workflow. The engine runs one node at a time and follows the
`nextNode` of each result. It also does these things:

- It validates the input and output of each node with Zod.
- It fills `{{stepId.field}}` templates with the output of earlier steps.
- It pauses at an approval gate and continues when you call `resumeWorkflow`.

Conditional nodes make branches, but execution is sequential. There is no parallel fan-out.

## Example

```ts
import { z } from 'zod';
import { defineNode, createRegistry, createExecutionContext, runWorkflow, builtInNodes } from 'pipewright';

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

## Built-in nodes

| Node | Category | Description |
|------|----------|-------------|
| `conditional` | logic | Branch on a condition on a context variable (equals, greater_than, contains, exists, and negations) |
| `delay` | logic | Wait N milliseconds before it continues |
| `end` | logic | Stop the workflow |
| `approval-gate` | logic | Pause for human approval before it continues |
| `map` | transform | Map array items through an object template with `{{item.field}}` |
| `test-gate` | logic | Run a command through an injected ExecService and branch on the exit code (0 = pass, other = fail) |
| `filter` | transform | Filter an array with a condition on each item |

Architecture, interpolation rules, approval gates, step events and design decisions:
[pipewright in detail](docs/details.md).

## Install and run

You can only install from a clone. The npm name `pipewright` belongs to an unrelated CI/CD scaffolding package,
so `npm install pipewright` gives you a different project.

```bash
git clone https://github.com/onblueroses/pipewright.git
cd pipewright
npm install
npm run build
npm test
```

The examples import from `pipewright`, which resolves through the package's self-reference after the build.
To import the build by path, use `./dist/index.js`. The path `./dist` alone fails with `ERR_UNSUPPORTED_DIR_IMPORT`.

## Layout

```text
src/core/    engine: registry, context, workflow runner
src/nodes/   built-in nodes
tests/       tests
examples/    example workflows (content pipeline, infra, orchestrator pattern)
docs/        notes for readers
```

## License

[MIT](LICENSE)
