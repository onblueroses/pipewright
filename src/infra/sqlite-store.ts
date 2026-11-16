import Database from "better-sqlite3";
import type {
	WorkflowState,
	WorkflowStatus,
	WorkflowStore,
} from "../core/stores.js";

/** A `WorkflowStore` in one SQLite file. */
export class SqliteWorkflowStore implements WorkflowStore {
	private readonly db: Database.Database;

	constructor(path = "workflows.db") {
		this.db = new Database(path);
		this.db.pragma("journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS workflows (
				id TEXT PRIMARY KEY,
				status TEXT NOT NULL,
				state TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
	}

	async save(state: WorkflowState): Promise<void> {
		this.db
			.prepare(
				`INSERT INTO workflows (id, status, state, updated_at) VALUES (?, ?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET status = excluded.status,
				   state = excluded.state, updated_at = excluded.updated_at`,
			)
			.run(state.id, state.status, JSON.stringify(state), state.updatedAt);
	}

	async load(id: string): Promise<WorkflowState | undefined> {
		const row = this.db
			.prepare("SELECT status, state, updated_at FROM workflows WHERE id = ?")
			.get(id) as Row | undefined;
		return row ? toState(row) : undefined;
	}

	async list(status?: WorkflowStatus): Promise<WorkflowState[]> {
		const rows = (
			status
				? this.db
						.prepare(
							"SELECT status, state, updated_at FROM workflows WHERE status = ? ORDER BY updated_at DESC",
						)
						.all(status)
				: this.db
						.prepare(
							"SELECT status, state, updated_at FROM workflows ORDER BY updated_at DESC",
						)
						.all()
		) as Row[];
		return rows.map(toState);
	}

	async transition(
		id: string,
		from: WorkflowStatus,
		to: WorkflowStatus,
	): Promise<boolean> {
		// One UPDATE with the old status in the WHERE clause is atomic in SQLite.
		const info = this.db
			.prepare(
				"UPDATE workflows SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
			)
			.run(to, new Date().toISOString(), id, from);
		return info.changes === 1;
	}

	close(): void {
		this.db.close();
	}
}

interface Row {
	status: string;
	state: string;
	updated_at: string;
}

// The status column is the source of truth, because `transition` changes only the column.
function toState(row: Row): WorkflowState {
	const state = JSON.parse(row.state) as WorkflowState;
	return {
		...state,
		status: row.status as WorkflowStatus,
		updatedAt: row.updated_at,
	};
}
