import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { defineNode } from "../../../core/node.js";
import {
	type FfmpegComposeInput,
	FfmpegComposeInputSchema,
	FfmpegComposeOutputSchema,
} from "./schemas.js";

function runFfmpeg(
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			resolve({ stdout, stderr, exitCode: code ?? 1 });
		});

		proc.on("error", (err) => {
			reject(new Error(`FFmpeg spawn error: ${err.message}`));
		});
	});
}

export const ffmpegComposeNode = defineNode({
	type: "ffmpeg-compose",
	name: "FFmpeg Compose",
	category: "action",
	inputSchema: FfmpegComposeInputSchema,
	outputSchema: FfmpegComposeOutputSchema,
	executor: async (input: FfmpegComposeInput) => {
		if (input.slidePaths.length !== input.slideDurations.length) {
			return {
				success: false,
				error: `slidePaths length (${input.slidePaths.length}) must match slideDurations length (${input.slideDurations.length})`,
			};
		}

		const totalDuration = input.slideDurations.reduce((a, b) => a + b, 0);

		// Build FFmpeg concat filter from slides + durations
		const concatFile = path.join(
			path.dirname(input.outputPath),
			".ffmpeg-concat.txt",
		);
		const concatContent = input.slidePaths
			.map((p, i) => `file '${p}'\nduration ${input.slideDurations[i]}`)
			.join("\n");
		await writeFile(concatFile, concatContent);

		const args = [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			concatFile,
			"-i",
			input.audioPath,
		];

		if (input.backgroundMusic) {
			args.push("-i", input.backgroundMusic);
			// Mix narration + background music
			args.push(
				"-filter_complex",
				`[1:a][2:a]amix=inputs=2:duration=first:weights=1 ${input.backgroundMusicVolume}[aout]`,
				"-map",
				"0:v",
				"-map",
				"[aout]",
			);
		} else {
			args.push("-map", "0:v", "-map", "1:a");
		}

		args.push(
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-shortest",
			input.outputPath,
		);

		const result = await runFfmpeg(args);

		if (result.exitCode !== 0) {
			return {
				success: false,
				error: `FFmpeg failed (exit ${result.exitCode}): ${result.stderr.slice(-500)}`,
			};
		}

		return {
			success: true,
			output: {
				videoPath: input.outputPath,
				durationSeconds: totalDuration,
			},
		};
	},
});
