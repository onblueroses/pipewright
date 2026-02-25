# Content Pipeline Example

Demonstrates pipewright's core features: custom nodes, service injection, `{{template}}` interpolation, conditional branching, and approval gates.

**Workflow:** fetch URL -> extract metadata -> quality check (word count) -> format -> human review -> publish

```
npx tsx examples/content-pipeline/pipeline.ts
```

The approval gate pauses execution mid-workflow. In production, you'd persist the state and resume after human review. This example simulates immediate approval.
