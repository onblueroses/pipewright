import type { WorkflowResult, WorkflowStep } from "./types.js";

/** Cache for step results. Swap in Redis or similar without touching the core. */
export interface CacheStore {
	get(key: string): Promise<unknown | undefined>;
	set(key: string, value: unknown, ttlMs?: number): Promise<void>;
	delete(key: string): Promise<void>;
}

export function createMemoryCacheStore(): CacheStore {
	const map = new Map<string, { value: unknown; expiresAt?: number }>();
	return {
		async get(key) {
			const entry = map.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
				map.delete(key);
				return undefined;
			}
			return entry.value;
		},
		async set(key, value, ttlMs) {
			map.set(key, {
				value,
				expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined,
			});
		},
		async delete(key) {
			map.delete(key);
		},
	};
}

export type WorkflowStatus =
	| "running"
	| "paused"
	| "completed"
	| "error"
	| "rejected";

/** Everything needed to resume a sequential run in another process. */
export interface WorkflowState {
	id: string;
	status: WorkflowStatus;
	result: WorkflowResult;
	contextSnapshot: Record<string, unknown>;
	steps: Record<string, WorkflowStep>;
	updatedAt: string;
}

/**
 * Persistence for sequential runs. The runner saves the state when a run starts,
 * pauses, fails or completes.
 */
export interface WorkflowStore {
	save(state: WorkflowState): Promise<void>;
	load(id: string): Promise<WorkflowState | undefined>;
	list(status?: WorkflowStatus): Promise<WorkflowState[]>;
	/**
	 * Change the status only if it is `from`, as one atomic step. Return false
	 * when the run is missing or has another status.
	 */
	transition(
		id: string,
		from: WorkflowStatus,
		to: WorkflowStatus,
	): Promise<boolean>;
}

/** In-memory store for tests and examples. */
export function createMemoryStore(): WorkflowStore {
	const map = new Map<string, WorkflowState>();
	return {
		async save(state) {
			map.set(state.id, structuredClone(state));
		},
		async load(id) {
			const state = map.get(id);
			return state ? structuredClone(state) : undefined;
		},
		async list(status) {
			return [...map.values()]
				.filter((s) => status === undefined || s.status === status)
				.map((s) => structuredClone(s));
		},
		async transition(id, from, to) {
			const state = map.get(id);
			if (state?.status !== from) return false;
			state.status = to;
			state.updatedAt = new Date().toISOString();
			return true;
		},
	};
}
