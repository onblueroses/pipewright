import { Hono } from 'hono';
import type { WorkflowStore } from './workflow-store.js';
import type { NodeServices } from 'pipewright';
import { ExecutionContext, NodeRegistry, resumeWorkflow } from 'pipewright';

export interface ApprovalAppDeps {
  store: WorkflowStore;
  registry: NodeRegistry;
  services: NodeServices;
}

export function createApprovalApp(deps: ApprovalAppDeps): Hono {
  const { store, registry, services } = deps;
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.get('/pending', (c) => {
    const records = store.listByStatus('paused');
    const summary = records.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      pausedAt: r.workflowResult.pausedAt,
      metadata: r.metadata,
    }));
    return c.json(summary);
  });

  app.post('/approve/:id', async (c) => {
    const id = c.req.param('id');
    const record = store.load(id);
    if (!record) {
      return c.json({ error: 'Workflow not found' }, 404);
    }
    if (record.status !== 'paused') {
      return c.json({ error: `Workflow is ${record.status}, not paused` }, 409);
    }

    store.updateStatus(id, 'approved');

    const context = ExecutionContext.fromJSON(record.contextSnapshot, services);
    try {
      const result = await resumeWorkflow(
        record.workflowResult,
        record.steps,
        registry,
        context,
      );

      const finalStatus = result.success && !result.pausedAt ? 'completed' : result.pausedAt ? 'paused' : 'error';
      store.updateStatus(id, finalStatus);

      return c.json({ status: finalStatus, result });
    } catch (err) {
      store.updateStatus(id, 'error');
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.post('/reject/:id', (c) => {
    const id = c.req.param('id');
    const record = store.load(id);
    if (!record) {
      return c.json({ error: 'Workflow not found' }, 404);
    }
    if (record.status !== 'paused') {
      return c.json({ error: `Workflow is ${record.status}, not paused` }, 409);
    }

    store.updateStatus(id, 'rejected');
    return c.json({ status: 'rejected' });
  });

  return app;
}
