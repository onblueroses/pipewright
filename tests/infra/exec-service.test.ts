import { describe, expect, it } from "vitest";
import { createExecService } from "../../src/infra/exec-service.js";

describe("createExecService", () => {
	const exec = createExecService();

	it("resolves exit code 0 with stdout", async () => {
		const result = await exec("echo hello");
		expect(result).toEqual({ exitCode: 0, stdout: "hello\n", stderr: "" });
	});

	it("resolves a non-zero exit code, which test-gate treats as a failed test", async () => {
		const result = await exec("echo oops >&2; exit 3");
		expect(result.exitCode).toBe(3);
		expect(result.stderr).toBe("oops\n");
	});

	it("rejects when the timeout stops the command", async () => {
		await expect(exec("sleep 5", { timeout: 50 })).rejects.toThrow();
	});

	it("rejects when the shell cannot start", async () => {
		await expect(
			createExecService("/nonexistent/shell")("echo hi"),
		).rejects.toThrow();
	});
});
