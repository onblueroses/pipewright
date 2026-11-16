import { describe, expect, it } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import { sqliteQueryNode } from "../../src/nodes/integrations/sqlite/index.js";

describe("sqlite_query node", () => {
	const registry = createRegistry();
	registry.register(sqliteQueryNode);

	it("creates table and inserts rows", async () => {
		const ctx = createExecutionContext();
		// Each execute opens its own connection, so use a temp file to persist
		// state across the CREATE and INSERT calls.
		const dbPath = `/tmp/sqlite-create-insert-${process.pid}.db`;

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)",
				mode: "run",
			},
			ctx,
		);

		const insertResult = await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "INSERT INTO test (name) VALUES (?)",
				params: ["hello"],
				mode: "run",
			},
			ctx,
		);

		expect(insertResult.success).toBe(true);
		expect(insertResult.output?.changes).toBe(1);

		const { unlinkSync } = await import("node:fs");
		try {
			unlinkSync(dbPath);
		} catch {
			/* ignore */
		}
	});

	it("selects rows with params", async () => {
		const ctx = createExecutionContext();

		// Use a single db path to test across calls - but in-memory is per-connection
		// so we use a temp file
		const dbPath = `/tmp/anf-sqlite-test-${Date.now()}.db`;

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query:
					"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, value TEXT)",
				mode: "run",
			},
			ctx,
		);

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "INSERT INTO items (value) VALUES (?)",
				params: ["alpha"],
				mode: "run",
			},
			ctx,
		);

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "INSERT INTO items (value) VALUES (?)",
				params: ["beta"],
				mode: "run",
			},
			ctx,
		);

		const result = await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "SELECT * FROM items WHERE value = ?",
				params: ["alpha"],
				mode: "all",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.rows).toHaveLength(1);
		expect(result.output?.rows?.[0]).toEqual(
			expect.objectContaining({ value: "alpha" }),
		);

		// Cleanup
		const { unlinkSync } = await import("node:fs");
		try {
			unlinkSync(dbPath);
		} catch {
			/* ignore */
		}
	});

	it("returns changes count on INSERT", async () => {
		const ctx = createExecutionContext();
		const dbPath = `/tmp/anf-sqlite-changes-${Date.now()}.db`;

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "CREATE TABLE t (x TEXT)",
				mode: "run",
			},
			ctx,
		);

		const result = await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "INSERT INTO t (x) VALUES (?)",
				params: ["val"],
				mode: "run",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.changes).toBe(1);

		const { unlinkSync } = await import("node:fs");
		try {
			unlinkSync(dbPath);
		} catch {
			/* ignore */
		}
	});

	it("handles get mode returning single row", async () => {
		const ctx = createExecutionContext();
		const dbPath = `/tmp/anf-sqlite-get-${Date.now()}.db`;

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)",
				mode: "run",
			},
			ctx,
		);

		await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "INSERT INTO t (name) VALUES (?)",
				params: ["one"],
				mode: "run",
			},
			ctx,
		);

		const result = await registry.execute(
			"sqlite-query",
			{
				dbPath,
				query: "SELECT * FROM t WHERE id = ?",
				params: [1],
				mode: "get",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.rows).toHaveLength(1);
		expect(result.output?.rows?.[0]).toEqual(
			expect.objectContaining({ name: "one" }),
		);

		const { unlinkSync } = await import("node:fs");
		try {
			unlinkSync(dbPath);
		} catch {
			/* ignore */
		}
	});

	it("throws on bad SQL", async () => {
		const ctx = createExecutionContext();

		await expect(
			registry.execute(
				"sqlite-query",
				{
					dbPath: ":memory:",
					query: "INVALID SQL STATEMENT",
					mode: "all",
				},
				ctx,
			),
		).rejects.toThrow();
	});
});
