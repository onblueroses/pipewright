import Database from 'better-sqlite3';
import type { WorkflowResult, WorkflowStep } from 'pipewright';
import type { WorkflowRecord, WorkflowStatus } from './types.js';

export class WorkflowStore {
  private db: Database.Database;

  constructor(dbPath: string = 'workflows.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        workflow_result TEXT NOT NULL,
        context_snapshot TEXT NOT NULL,
        steps TEXT NOT NULL,
        start_node TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  save(record: WorkflowRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, status, workflow_result, context_snapshot, steps, start_node, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.status,
      JSON.stringify(record.workflowResult),
      JSON.stringify(record.contextSnapshot),
      JSON.stringify(record.steps),
      record.startNode,
      JSON.stringify(record.metadata),
      record.createdAt,
      record.updatedAt,
    );
  }

  load(id: string): WorkflowRecord | null {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, string> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  updateStatus(id: string, status: WorkflowStatus): void {
    const stmt = this.db.prepare('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  listByStatus(status: WorkflowStatus): WorkflowRecord[] {
    const rows = this.db.prepare('SELECT * FROM workflows WHERE status = ? ORDER BY created_at DESC').all(status) as Record<string, string>[];
    return rows.map((row) => this.rowToRecord(row));
  }

  close(): void {
    this.db.close();
  }

  private rowToRecord(row: Record<string, string>): WorkflowRecord {
    return {
      id: row.id,
      status: row.status as WorkflowStatus,
      workflowResult: JSON.parse(row.workflow_result) as WorkflowResult,
      contextSnapshot: JSON.parse(row.context_snapshot) as Record<string, unknown>,
      steps: JSON.parse(row.steps) as Record<string, WorkflowStep>,
      startNode: row.start_node,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
