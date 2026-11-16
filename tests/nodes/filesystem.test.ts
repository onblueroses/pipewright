import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";
import {
	fileReadNode,
	fileWriteNode,
} from "../../src/nodes/integrations/filesystem/index.js";

describe("file_read and file_write nodes", () => {
	let tmpDir: string;
	let registry: ReturnType<typeof createRegistry>;

	beforeAll(async () => {
		tmpDir = await mkdtemp(path.join(os.tmpdir(), "anf-test-"));
		registry = createRegistry();
		registry.register(fileReadNode);
		registry.register(fileWriteNode);
	});

	afterAll(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("writes and reads a file", async () => {
		const filePath = path.join(tmpDir, "test.txt");
		const ctx = createExecutionContext();

		const writeResult = await registry.execute(
			"file-write",
			{
				path: filePath,
				content: "hello world",
			},
			ctx,
		);

		expect(writeResult.success).toBe(true);
		expect(writeResult.output?.bytesWritten).toBe(11);

		const readResult = await registry.execute(
			"file-read",
			{
				path: filePath,
			},
			ctx,
		);

		expect(readResult.success).toBe(true);
		expect(readResult.output?.content).toBe("hello world");
		expect(readResult.output?.size).toBe(11);
	});

	it("creates nested directories on write", async () => {
		const filePath = path.join(tmpDir, "nested", "dir", "file.md");
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"file-write",
			{
				path: filePath,
				content: "# Title",
			},
			ctx,
		);

		expect(result.success).toBe(true);
	});

	it("appends to a file", async () => {
		const filePath = path.join(tmpDir, "append.txt");
		const ctx = createExecutionContext();

		await registry.execute(
			"file-write",
			{
				path: filePath,
				content: "line1\n",
			},
			ctx,
		);

		await registry.execute(
			"file-write",
			{
				path: filePath,
				content: "line2\n",
				append: true,
			},
			ctx,
		);

		const readResult = await registry.execute(
			"file-read",
			{
				path: filePath,
			},
			ctx,
		);

		expect(readResult.output?.content).toBe("line1\nline2\n");
	});

	it("returns error for missing file on read", async () => {
		const ctx = createExecutionContext();

		await expect(
			registry.execute(
				"file-read",
				{
					path: path.join(tmpDir, "nonexistent.txt"),
				},
				ctx,
			),
		).rejects.toThrow();
	});

	it("rejects relative paths", async () => {
		const ctx = createExecutionContext();

		await expect(
			registry.execute("file-read", { path: "relative/path.txt" }, ctx),
		).rejects.toThrow();
	});
});
