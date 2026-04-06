/**
 * Pluggable store interfaces for caching and rate limiting.
 * Consumers swap in Redis/Memcached without touching core.
 */

export interface CacheStore {
	get(key: string): Promise<unknown | undefined>;
	set(key: string, value: unknown, ttlMs?: number): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface RateLimitStore {
	/** Increment the counter for a key within a sliding window. Returns current count. */
	increment(key: string, windowMs: number): Promise<number>;
	/** Check if the key has exceeded the limit within the window. */
	isLimited(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export function createMemoryCacheStore(): CacheStore {
	const map = new Map<string, { value: unknown; expiresAt?: number }>();

	return {
		async get(key) {
			const entry = map.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
				map.delete(key);
				return undefined;
			}
			return entry.value;
		},
		async set(key, value, ttlMs) {
			map.set(key, {
				value,
				expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined,
			});
		},
		async delete(key) {
			map.delete(key);
		},
	};
}

export function createMemoryRateLimitStore(): RateLimitStore {
	const map = new Map<string, { count: number; windowStart: number }>();

	return {
		async increment(key, windowMs) {
			const now = Date.now();
			const entry = map.get(key);
			if (!entry || now - entry.windowStart >= windowMs) {
				map.set(key, { count: 1, windowStart: now });
				return 1;
			}
			entry.count++;
			return entry.count;
		},
		async isLimited(key, limit, windowMs) {
			const now = Date.now();
			const entry = map.get(key);
			if (!entry || now - entry.windowStart >= windowMs) return false;
			return entry.count >= limit;
		},
	};
}
