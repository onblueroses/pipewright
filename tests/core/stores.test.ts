import { describe, expect, it } from "vitest";
import type { WorkflowState, WorkflowStatus } from "../../src/core/stores.js";
import {
	createMemoryCacheStore,
	createMemoryStore,
} from "../../src/core/stores.js";

describe("CacheStore", () => {
	it("returns undefined for missing key", async () => {
		const store = createMemoryCacheStore();
		expect(await store.get("missing")).toBeUndefined();
	});

	it("stores and retrieves a value", async () => {
		const store = createMemoryCacheStore();
		await store.set("key", { data: 42 });
		expect(await store.get("key")).toEqual({ data: 42 });
	});

	it("deletes a value", async () => {
		const store = createMemoryCacheStore();
		await store.set("key", "val");
		await store.delete("key");
		expect(await store.get("key")).toBeUndefined();
	});

	it("expires values after TTL", async () => {
		const store = createMemoryCacheStore();
		await store.set("key", "val", 1); // 1ms TTL
		await new Promise((r) => setTimeout(r, 10));
		expect(await store.get("key")).toBeUndefined();
	});

	it("keeps values without TTL indefinitely", async () => {
		const store = createMemoryCacheStore();
		await store.set("key", "val");
		await new Promise((r) => setTimeout(r, 10));
		expect(await store.get("key")).toBe("val");
	});

	it("overwrites existing values", async () => {
		const store = createMemoryCacheStore();
		await store.set("key", "old");
		await store.set("key", "new");
		expect(await store.get("key")).toBe("new");
	});
});

const makeState = (
	id: string,
	status: WorkflowStatus = "completed",
): WorkflowState => ({
	id,
	status,
	result: { steps: [], success: status === "completed" },
	contextSnapshot: { key: "value" },
	steps: { start: { nodeType: "test", input: {} } },
	updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("createMemoryStore", () => {
	it("saves and loads a state", async () => {
		const store = createMemoryStore();
		const state = makeState("wf-1");
		await store.save(state);
		expect(await store.load("wf-1")).toEqual(state);
	});

	it("returns undefined for an unknown ID", async () => {
		expect(await createMemoryStore().load("nonexistent")).toBeUndefined();
	});

	it("overwrites an existing state", async () => {
		const store = createMemoryStore();
		await store.save(makeState("wf-1", "paused"));
		await store.save(makeState("wf-1", "completed"));
		expect((await store.load("wf-1"))?.status).toBe("completed");
	});

	it("keeps deep copies, so mutations do not leak", async () => {
		const store = createMemoryStore();
		const state = makeState("wf-1");
		await store.save(state);
		state.contextSnapshot.key = "mutated";
		const loaded = await store.load("wf-1");
		expect(loaded?.contextSnapshot.key).toBe("value");
		if (loaded) loaded.contextSnapshot.key = "mutated-again";
		expect((await store.load("wf-1"))?.contextSnapshot.key).toBe("value");
	});

	it("lists all states or the states with one status", async () => {
		const store = createMemoryStore();
		await store.save(makeState("a", "paused"));
		await store.save(makeState("b", "completed"));
		await store.save(makeState("c", "paused"));
		expect(await store.list()).toHaveLength(3);
		const paused = await store.list("paused");
		expect(paused.map((s) => s.id).sort()).toEqual(["a", "c"]);
	});

	it("transitions only from the expected status", async () => {
		const store = createMemoryStore();
		await store.save(makeState("wf-1", "paused"));
		expect(await store.transition("wf-1", "paused", "running")).toBe(true);
		expect(await store.transition("wf-1", "paused", "running")).toBe(false);
		expect((await store.load("wf-1"))?.status).toBe("running");
		expect(await store.transition("missing", "paused", "running")).toBe(false);
	});
});
