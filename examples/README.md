# Examples

Every example runs offline. The lead nodes are stand-ins, and a comment names the real node
from `pipewright/nodes` to use in production. Run an example with `npx tsx <file>`.
The tests in `tests/examples/` run most of them.

| Example                                                  | Runner     | What it shows                                                           |
| -------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| [content-pipeline](content-pipeline/)                    | sequential | custom nodes, interpolation, a branch, an approval gate                 |
| [orchestrator-pattern](orchestrator-pattern/)            | sequential | a verify-then-fix loop with `test-gate` and `conditional`               |
| [community-responder.ts](community-responder.ts)         | sequential | monitor, score, draft, then a human approves (nothing posts on its own) |
| [daily-content-publisher.ts](daily-content-publisher.ts) | sequential | pick a topic, write, grade, deploy only above a score                   |
| [source-monitor.ts](source-monitor.ts)                   | sequential | fetch public sources, rank, write a digest                              |
| [video-pipeline.ts](video-pipeline.ts)                   | sequential | script, slides, speech, compose, publish                                |
| [dag-fan-out.ts](dag-fan-out.ts)                         | DAG        | two sources in one wave, then merge and sort                            |
| [cost-tracked-workflow.ts](cost-tracked-workflow.ts)     | sequential | `CostTracker`, `wrapLLMService`, soft and hard budget limits            |
| [approval-server](approval-server/)                      | server     | SQLite store, e-mail links and approve/reject endpoints                 |

The examples import from `pipewright`. Inside this repo, `tsconfig.json` and `vitest.config.ts`
map that name to `src/`.
