/** Per-step execution settings. Set them by node type or by step ID. */
export interface NodeExecutionConfig {
	/** Extra attempts after a thrown error. A result with `success: false` is not retried. */
	retryCount: number;
	/** Wait before retry n: retryDelayMs * 2^n. Default 0. */
	retryDelayMs?: number;
	/** Fail the step when it runs longer than this. No timeout when unset. */
	timeoutMs?: number;
	/** Reuse a successful result for this long. Needs `cacheStore` in the workflow options. */
	cacheTtlMs?: number;
	/** Cache key. The default is node type, step ID and a hash of the input. */
	cacheKey?: string;
}

/** Priority: step ID override, then node type override, then defaults. */
export function resolveNodeConfig(
	nodeType: string,
	stepId: string,
	nodeConfig?: Record<string, Partial<NodeExecutionConfig>>,
): NodeExecutionConfig {
	return {
		retryCount: 0,
		...nodeConfig?.[nodeType],
		...nodeConfig?.[stepId],
	};
}
