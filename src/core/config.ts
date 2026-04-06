/** Per-node execution configuration, resolved at workflow runtime. */

export interface NodeExecutionConfig {
	retryCount: number;
	timeoutMs: number;
	cacheTtlMs?: number;
	cacheKey?: string;
}

const DEFAULTS: NodeExecutionConfig = {
	retryCount: 0,
	timeoutMs: 30000,
};

/**
 * Resolve execution config for a node. Priority: stepId override > nodeType override > defaults.
 */
export function resolveNodeConfig(
	nodeType: string,
	stepId: string,
	nodeConfig?: Record<string, Partial<NodeExecutionConfig>>,
): NodeExecutionConfig {
	if (!nodeConfig) return { ...DEFAULTS };

	const typeOverride = nodeConfig[nodeType] ?? {};
	const stepOverride = nodeConfig[stepId] ?? {};

	return { ...DEFAULTS, ...typeOverride, ...stepOverride };
}
