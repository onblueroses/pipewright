# Orchestrator Pattern

A verify-then-fix loop using `test-gate` and `conditional` nodes. No dedicated retry node - retry is expressed as workflow topology.

## Workflow

```
plan -> work -> verify (test-gate)
                  |
          exit 0: done
          exit !0: check_retries (conditional)
                      |
              under limit: fix -> work (loop)
              exhausted:   failed
```

## How it works

1. **plan** generates a task description
2. **work** produces an artifact (code, config, etc.)
3. **verify** runs `npm test` (or any command) via test-gate
4. If tests pass (exit 0), workflow reaches **done**
5. If tests fail, **check_retries** uses conditional to check `_retryCount < MAX_RETRIES`
6. Under the limit, **fix** reads `verify.stderr` for error context, increments `_retryCount`, and loops back to **work**
7. If retries exhausted, workflow reaches **failed**

## Key design choices

- **Retry is topology, not a node.** The loop emerges from `nextNode` connections, not from a retry primitive. This keeps nodes simple and composable.
- **Runner's `maxSteps` prevents infinite loops.** Even if the retry limit is misconfigured, the workflow runner stops after 100 steps by default.
- **Error context flows through the graph.** The fix node reads `verify.stderr` and `verify.exitCode` via context interpolation to understand what went wrong.

## Running

```bash
npx tsx examples/orchestrator-pattern/pipeline.ts
```

Replace the stub nodes (`plan-task`, `do-work`, `fix-task`) with real implementations for your use case.
