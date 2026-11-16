import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExecutionContext } from "../../src/core/context.js";
import { createRegistry } from "../../src/core/registry.js";

// Mock child_process for SSH, Git, FFmpeg
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
	execFile: vi.fn(),
}));

// Mock fs/promises for TTS file writing
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, writeFile: vi.fn().mockResolvedValue(undefined) };
});

describe("ssh_exec node", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("executes SSH command successfully", async () => {
		const { spawn } = await import("node:child_process");
		const mockProc = {
			stdout: { on: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn(),
			kill: vi.fn(),
		};

		vi.mocked(spawn).mockReturnValue(mockProc as never);

		// Simulate stdout data + close
		mockProc.stdout.on.mockImplementation(
			(event: string, cb: (data: Buffer) => void) => {
				if (event === "data")
					setTimeout(() => cb(Buffer.from("output data")), 0);
			},
		);
		mockProc.stderr.on.mockImplementation(() => {});
		mockProc.on.mockImplementation(
			(event: string, cb: (...args: unknown[]) => void) => {
				if (event === "close") setTimeout(() => cb(0), 5);
			},
		);

		const { sshExecNode } = await import(
			"../../src/nodes/integrations/ssh/index.js"
		);
		const registry = createRegistry();
		registry.register(sshExecNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"ssh-exec",
			{
				host: "example.com",
				command: "echo hello",
				user: "deploy",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.stdout).toBe("output data");
		expect(result.output?.exitCode).toBe(0);

		// Verify ssh was called with correct args
		expect(spawn).toHaveBeenCalledWith(
			"ssh",
			expect.arrayContaining(["deploy@example.com", "echo hello"]),
			expect.any(Object),
		);
	});
});

describe("git_operations node", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs git status", async () => {
		const { execFile } = await import("node:child_process");
		vi.mocked(execFile).mockImplementation(((
			_cmd: string,
			_args: unknown,
			_opts: unknown,
			cb: (...args: unknown[]) => void,
		) => {
			cb(null, "M file.ts\n", "");
			return {} as unknown;
		}) as never);

		const { gitOperationsNode } = await import(
			"../../src/nodes/integrations/git/index.js"
		);
		const registry = createRegistry();
		registry.register(gitOperationsNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"git-operations",
			{
				repoPath: "/tmp/test-repo",
				operation: "status",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.result).toContain("M file.ts");
	});

	it("runs git commit with message", async () => {
		const { execFile } = await import("node:child_process");
		vi.mocked(execFile).mockImplementation(((
			_cmd: string,
			_args: unknown,
			_opts: unknown,
			cb: (...args: unknown[]) => void,
		) => {
			cb(null, "[main abc1234] test commit\n", "");
			return {} as unknown;
		}) as never);

		const { gitOperationsNode } = await import(
			"../../src/nodes/integrations/git/index.js"
		);
		const registry = createRegistry();
		registry.register(gitOperationsNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"git-operations",
			{
				repoPath: "/tmp/test-repo",
				operation: "commit",
				message: "test commit",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(execFile).toHaveBeenCalledWith(
			"git",
			["commit", "-m", "test commit"],
			expect.objectContaining({ cwd: "/tmp/test-repo" }),
			expect.any(Function),
		);
	});
});

describe("elevenlabs_tts node", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("generates TTS audio", async () => {
		const audioData = new Uint8Array([0, 1, 2, 3]).buffer;
		vi.mocked(globalThis.fetch).mockResolvedValue({
			status: 200,
			ok: true,
			headers: new Headers({ "content-type": "audio/mpeg" }),
			arrayBuffer: async () => audioData,
			text: async () => "",
			json: async () => ({}),
		} as unknown as Response);

		const { elevenlabsTtsNode } = await import(
			"../../src/nodes/integrations/elevenlabs/index.js"
		);
		const registry = createRegistry();
		registry.register(elevenlabsTtsNode);
		const ctx = createExecutionContext(
			{},
			{},
			{ elevenlabs: { apiKey: "el-key" } },
		);

		const result = await registry.execute(
			"elevenlabs-tts",
			{
				text: "Hello, this is a test.",
				outputPath: "/tmp/test-audio.mp3",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		expect(result.output?.audioPath).toBe("/tmp/test-audio.mp3");
		expect(result.output?.charactersUsed).toBe(22);
	});

	it("chunks long text into multiple API calls", async () => {
		const audioData = new Uint8Array([0]).buffer;
		vi.mocked(globalThis.fetch).mockResolvedValue({
			status: 200,
			ok: true,
			headers: new Headers(),
			arrayBuffer: async () => audioData,
			text: async () => "",
			json: async () => ({}),
		} as unknown as Response);

		const { elevenlabsTtsNode } = await import(
			"../../src/nodes/integrations/elevenlabs/index.js"
		);
		const registry = createRegistry();
		registry.register(elevenlabsTtsNode);
		const ctx = createExecutionContext(
			{},
			{},
			{ elevenlabs: { apiKey: "el-key" } },
		);

		// Create text longer than 2000 chars
		const longText = "This is a long sentence. ".repeat(100);

		const result = await registry.execute(
			"elevenlabs-tts",
			{
				text: longText,
				outputPath: "/tmp/long-audio.mp3",
			},
			ctx,
		);

		expect(result.success).toBe(true);
		// Should have made multiple API calls
		expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(1);
	});
});

describe("ffmpeg_compose node", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects mismatched slides and durations", async () => {
		const { ffmpegComposeNode } = await import(
			"../../src/nodes/integrations/ffmpeg/index.js"
		);
		const registry = createRegistry();
		registry.register(ffmpegComposeNode);
		const ctx = createExecutionContext();

		const result = await registry.execute(
			"ffmpeg-compose",
			{
				audioPath: "/tmp/audio.mp3",
				slidePaths: ["/tmp/slide1.png", "/tmp/slide2.png"],
				outputPath: "/tmp/output.mp4",
				slideDurations: [5], // Mismatch: 2 slides but 1 duration
			},
			ctx,
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("must match");
	});
});
