/**
 * Content pipeline example - demonstrates custom nodes, service injection,
 * context interpolation, conditional branching, and approval gates.
 *
 * Workflow: fetch -> extract metadata -> quality check -> format -> review -> publish
 */

import { z } from 'zod';
import {
  defineNode,
  createRegistry,
  createExecutionContext,
  runWorkflow,
  resumeWorkflow,
  builtInNodes,
} from '../../src/index.js';

// --- Custom nodes ---

const fetchUrlNode = defineNode({
  type: 'fetch-url',
  name: 'Fetch URL',
  category: 'action',
  inputSchema: z.object({ url: z.string() }),
  outputSchema: z.object({ body: z.string(), statusCode: z.number() }),
  executor: async (input) => {
    // In a real app, this would be an HTTP fetch
    const body = `<h1>Sample Article</h1><p>This is a detailed article about workflow engines. `
      + `It covers DAG execution, typed nodes, and approval gates. The content spans multiple `
      + `paragraphs and provides practical examples for building reliable pipelines.</p>`;
    return {
      success: true,
      output: { body, statusCode: 200 },
      nextNode: 'extract',
    };
  },
});

const extractMetaNode = defineNode({
  type: 'extract-meta',
  name: 'Extract Metadata',
  category: 'transform',
  inputSchema: z.object({ body: z.string() }),
  outputSchema: z.object({ title: z.string(), wordCount: z.number(), author: z.string() }),
  executor: async (input) => {
    const titleMatch = /<h1>(.*?)<\/h1>/.exec(input.body);
    const plainText = input.body.replace(/<[^>]+>/g, '');
    return {
      success: true,
      output: {
        title: titleMatch?.[1] ?? 'Untitled',
        wordCount: plainText.split(/\s+/).filter(Boolean).length,
        author: 'Unknown',
      },
      nextNode: 'check',
    };
  },
});

const formatOutputNode = defineNode({
  type: 'format-output',
  name: 'Format Output',
  category: 'transform',
  inputSchema: z.object({ title: z.string(), body: z.string() }),
  outputSchema: z.object({ formatted: z.string() }),
  executor: async (input) => {
    const plainText = input.body.replace(/<[^>]+>/g, '');
    return {
      success: true,
      output: { formatted: `# ${input.title}\n\n${plainText}` },
      nextNode: 'review',
    };
  },
});

const publishNode = defineNode({
  type: 'publish',
  name: 'Publish',
  category: 'action',
  inputSchema: z.object({ content: z.string(), path: z.string() }),
  outputSchema: z.object({ published: z.boolean(), path: z.string() }),
  executor: async (input) => {
    // In a real app: write to filesystem via injected FileWriter service
    console.log(`Publishing to ${input.path} (${input.content.length} chars)`);
    return {
      success: true,
      output: { published: true, path: input.path },
    };
  },
});

// --- Workflow definition ---

const steps = {
  fetch:   { nodeType: 'fetch-url', input: { url: '{{config.sourceUrl}}' } },
  extract: { nodeType: 'extract-meta', input: { body: '{{fetch.body}}' } },
  check:   { nodeType: 'conditional', input: {
    variable: 'extract.wordCount',
    condition: 'greater_than',
    value: 10,
    trueNode: 'format',
    falseNode: 'reject',
  }},
  format:  { nodeType: 'format-output', input: { title: '{{extract.title}}', body: '{{fetch.body}}' } },
  review:  { nodeType: 'approval-gate', input: { message: 'Review: {{extract.title}}', nextNode: 'publish' } },
  publish: { nodeType: 'publish', input: { content: '{{format.formatted}}', path: '{{config.outputDir}}/article.md' } },
  reject:  { nodeType: 'end', input: { message: 'Below word count threshold' } },
};

// --- Run it ---

async function main() {
  const registry = createRegistry();
  registry.registerAll(builtInNodes);
  registry.registerAll([fetchUrlNode, extractMetaNode, formatOutputNode, publishNode]);

  const ctx = createExecutionContext({}, {
    config: { sourceUrl: 'https://example.com/article', outputDir: './output' },
  });

  console.log('Starting content pipeline...\n');
  const result = await runWorkflow(steps, 'fetch', registry, ctx, {
    onStep: (event) => {
      const status = event.result.success ? 'OK' : 'FAIL';
      console.log(`  [${status}] ${event.stepId} (${event.nodeType}) - ${event.durationMs}ms`);
    },
  });

  if (result.pausedAt) {
    console.log(`\nWorkflow paused at "${result.pausedAt}" - awaiting approval.`);
    console.log('Simulating approval...\n');

    const resumed = await resumeWorkflow(result, steps, registry, ctx, {
      onStep: (event) => {
        const status = event.result.success ? 'OK' : 'FAIL';
        console.log(`  [${status}] ${event.stepId} (${event.nodeType}) - ${event.durationMs}ms`);
      },
    });

    console.log(`\nPipeline ${resumed.success ? 'completed' : 'failed'}.`);
  } else {
    console.log(`\nPipeline ${result.success ? 'completed' : 'failed'}.`);
  }
}

main().catch(console.error);
