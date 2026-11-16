import type {
	ExecutionContext as IExecutionContext,
	NodeCredentials,
	NodeServices,
} from "./types.js";

/**
 * Holds step outputs and moves them between steps through `{{stepId.field}}`
 * templates. It also carries the injected services and credentials.
 */
export class ExecutionContext implements IExecutionContext {
	readonly services: NodeServices;
	readonly credentials?: NodeCredentials;
	private vars: Record<string, unknown>;

	constructor(
		services: NodeServices = {},
		initialVars: Record<string, unknown> = {},
		credentials?: NodeCredentials,
	) {
		this.services = services;
		this.credentials = credentials;
		this.vars = { ...initialVars };
	}

	/** The runners store each output under its step ID, never under the node type. */
	setNodeOutput(stepId: string, output: unknown): void {
		this.vars[stepId] = output;
	}

	/** Read a dot path with optional array indexes: `fetch.items[0].name`. */
	get(path: string): unknown {
		let current: unknown = this.vars;
		for (const part of path.split(".")) {
			if (current === null || typeof current !== "object") return undefined;
			const indexed = /^([^[]+)\[(\d+)\]$/.exec(part);
			if (indexed) {
				const list = (current as Record<string, unknown>)[indexed[1]];
				if (!Array.isArray(list)) return undefined;
				current = list[Number(indexed[2])];
			} else {
				current = (current as Record<string, unknown>)[part];
			}
		}
		return current;
	}

	set(key: string, value: unknown): void {
		this.vars[key] = value;
	}

	/**
	 * A template that is exactly one `{{path}}` returns the raw value (array,
	 * object, number). Other templates return a string. Unknown paths stay as written.
	 */
	interpolate(template: string): unknown {
		const single = /^\{\{([^}]+)\}\}$/.exec(template);
		if (single) {
			const value = this.get(single[1].trim());
			return value !== undefined ? value : template;
		}
		return template.replace(/\{\{([^}]+)\}\}/g, (match, path: string) => {
			const value = this.get(path.trim());
			return value === undefined || value === null ? match : formatValue(value);
		});
	}

	/**
	 * Interpolate every string in an object, recursively. The runtime types can
	 * differ from `T`, because a single-variable template can resolve to any value.
	 * The registry parses the result with the node's input schema.
	 */
	interpolateObject<T extends Record<string, unknown>>(obj: T): T {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = this.interpolateValue(value);
		}
		return result as T;
	}

	private interpolateValue(value: unknown): unknown {
		if (typeof value === "string") return this.interpolate(value);
		if (Array.isArray(value)) return value.map((v) => this.interpolateValue(v));
		if (value !== null && typeof value === "object") {
			return this.interpolateObject(value as Record<string, unknown>);
		}
		return value;
	}

	/** A deep copy of all variables. Persist it and restore it with `fromJSON`. */
	snapshot(): Record<string, unknown> {
		return structuredClone(this.vars);
	}

	static fromJSON(
		data: Record<string, unknown>,
		services?: NodeServices,
		credentials?: NodeCredentials,
	): ExecutionContext {
		return new ExecutionContext(services, data, credentials);
	}
}

export function createExecutionContext(
	services?: NodeServices,
	initialVars?: Record<string, unknown>,
	credentials?: NodeCredentials,
): ExecutionContext {
	return new ExecutionContext(services, initialVars, credentials);
}

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.join(", ");
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}
