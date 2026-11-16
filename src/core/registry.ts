import type { ZodError } from "zod";
import type {
	AnyNodeDefinition,
	ExecutionContext,
	NodeCategory,
	NodeMetadata,
	NodeResult,
} from "./types.js";

/** The input or the output of a node does not match its schema. */
export class NodeValidationError extends Error {
	constructor(
		readonly nodeType: string,
		readonly boundary: "input" | "output",
		readonly issues: ZodError["issues"],
	) {
		const detail = issues
			.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
			.join(", ");
		super(`Node "${nodeType}" ${boundary} validation failed: ${detail}`);
		this.name = "NodeValidationError";
	}
}

/** A catalog of nodes. It validates input and output at every execution. */
export class NodeRegistry {
	private defs = new Map<string, AnyNodeDefinition>();

	register(def: AnyNodeDefinition): void {
		if (this.defs.has(def.type)) {
			throw new Error(`Node type "${def.type}" is already registered`);
		}
		this.defs.set(def.type, def);
	}

	registerAll(defs: readonly AnyNodeDefinition[]): void {
		for (const def of defs) this.register(def);
	}

	has(type: string): boolean {
		return this.defs.has(type);
	}

	unregister(type: string): boolean {
		return this.defs.delete(type);
	}

	/**
	 * Parse the input, run the executor, then parse the output of a successful
	 * result. The returned result carries the parsed output, so schema defaults
	 * and transforms apply. A successful result without valid output is an error.
	 */
	async execute<TOutput = any>(
		type: string,
		rawInput: unknown,
		context: ExecutionContext,
	): Promise<NodeResult<TOutput>> {
		const def = this.defs.get(type);
		if (!def) throw new Error(`Node type "${type}" is not registered`);

		const input = def.inputSchema.safeParse(rawInput);
		if (!input.success) {
			throw new NodeValidationError(type, "input", input.error.issues);
		}

		const result = await def.executor(input.data, context);
		if (!result.success) return result as NodeResult<TOutput>;

		const output = def.outputSchema.safeParse(result.output);
		if (!output.success) {
			throw new NodeValidationError(type, "output", output.error.issues);
		}
		return { ...result, output: output.data as TOutput };
	}

	getMetadata(type: string): NodeMetadata | undefined {
		const def = this.defs.get(type);
		if (!def) return undefined;
		const {
			executor: _executor,
			inputSchema: _in,
			outputSchema: _out,
			...metadata
		} = def;
		return metadata;
	}

	getByCategory(category: NodeCategory): AnyNodeDefinition[] {
		return [...this.defs.values()].filter((d) => d.category === category);
	}

	getTypes(): string[] {
		return [...this.defs.keys()];
	}
}

export function createRegistry(): NodeRegistry {
	return new NodeRegistry();
}
