import { describe, expect, it } from "vitest";
import {
	createMemoryCacheStore,
	createMemoryRateLimitStore,
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

describe("RateLimitStore", () => {
	it("increments and returns count", async () => {
		const store = createMemoryRateLimitStore();
		expect(await store.increment("key", 60000)).toBe(1);
		expect(await store.increment("key", 60000)).toBe(2);
		expect(await store.increment("key", 60000)).toBe(3);
	});

	it("reports not limited below threshold", async () => {
		const store = createMemoryRateLimitStore();
		await store.increment("key", 60000);
		expect(await store.isLimited("key", 5, 60000)).toBe(false);
	});

	it("reports limited at threshold", async () => {
		const store = createMemoryRateLimitStore();
		for (let i = 0; i < 5; i++) {
			await store.increment("key", 60000);
		}
		expect(await store.isLimited("key", 5, 60000)).toBe(true);
	});

	it("resets after window expires", async () => {
		const store = createMemoryRateLimitStore();
		await store.increment("key", 1); // 1ms window
		await store.increment("key", 1);
		await new Promise((r) => setTimeout(r, 10));
		expect(await store.isLimited("key", 2, 1)).toBe(false);
		expect(await store.increment("key", 1)).toBe(1);
	});

	it("tracks keys independently", async () => {
		const store = createMemoryRateLimitStore();
		await store.increment("a", 60000);
		await store.increment("a", 60000);
		await store.increment("b", 60000);
		expect(await store.isLimited("a", 2, 60000)).toBe(true);
		expect(await store.isLimited("b", 2, 60000)).toBe(false);
	});
});
