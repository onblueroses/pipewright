/** HTTP helper for the integration nodes: retries, timeouts, and fail-closed status checks. */

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchWithRetryOptions {
	/** Attempts in total, including the first. Default 1: no retry. */
	maxRetries?: number;
	/** Wait before retry n: backoffMs * 2^n. Default 0. */
	backoffMs?: number;
	/** Abort an attempt after this many ms. No timeout when unset. */
	timeoutMs?: number;
	/** Extra status codes to retry, besides 429 and 5xx. */
	retryOn?: number[];
	/** Return non-2xx responses instead of throwing. For callers that read the status themselves. */
	allowHttpErrors?: boolean;
}

// No retry count, backoff or timeout is built in. Set them per step with the
// engine's nodeConfig (retryCount, timeoutMs), or pass them here.

export class FetchRetryError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly body?: string,
	) {
		super(message);
		this.name = "FetchRetryError";
	}
}

/**
 * `fetch` with retries on 429, 5xx, timeouts and network errors. It throws on
 * every other non-2xx status, so a node cannot read an error body as data.
 */
export async function fetchWithRetry(
	url: string,
	options: RequestInit = {},
	config: FetchWithRetryOptions = {},
): Promise<Response> {
	const {
		maxRetries = 1,
		backoffMs = 0,
		timeoutMs,
		retryOn,
		allowHttpErrors = false,
	} = config;
	const attempts = Math.max(1, maxRetries);
	const backoff = (attempt: number) => sleep(backoffMs * 2 ** attempt);
	let lastError: Error = new FetchRetryError("Max retries exceeded");

	for (let attempt = 0; attempt < attempts; attempt++) {
		const last = attempt === attempts - 1;
		const controller = new AbortController();
		const timer =
			timeoutMs === undefined
				? undefined
				: setTimeout(() => controller.abort(), timeoutMs);
		let response: Response;
		try {
			response = await fetch(url, { ...options, signal: controller.signal });
		} catch (error) {
			const timedOut = error instanceof Error && error.name === "AbortError";
			lastError = timedOut
				? new FetchRetryError(
						`Request to ${describe(url)} timed out after ${timeoutMs}ms`,
					)
				: error instanceof Error
					? error
					: new Error(String(error));
			if (!last) await backoff(attempt);
			continue;
		} finally {
			clearTimeout(timer);
		}

		const { status } = response;
		const retryable =
			status === 429 ||
			(status >= 500 && status < 600) ||
			retryOn?.includes(status);
		if (retryable && !last) {
			const retryAfter = Number(response.headers.get("retry-after"));
			await response.body?.cancel();
			// A 429 with Retry-After waits as long as the service asks.
			if (status === 429 && retryAfter > 0) {
				await sleep(retryAfter * 1000);
			} else {
				await backoff(attempt);
			}
			continue;
		}

		if (!response.ok && !allowHttpErrors) {
			const body = await response.text().catch(() => "");
			throw new FetchRetryError(
				`HTTP ${status} ${response.statusText} from ${describe(url)}: ${body.slice(0, 500)}`,
				status,
				body,
			);
		}
		return response;
	}
	throw lastError;
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const body = await response.text();
		throw new FetchRetryError(
			`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
			response.status,
			body,
		);
	}
	return response.json() as Promise<T>;
}

/** Origin and path only. Query strings can hold API keys, and errors get persisted. */
function describe(url: string): string {
	try {
		const { origin, pathname } = new URL(url);
		return origin + pathname;
	} catch {
		return "(invalid URL)";
	}
}
