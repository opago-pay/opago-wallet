export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (cause: unknown) => boolean;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

const delay = (delayMs: number) => new Promise<void>(resolve => setTimeout(resolve, delayMs));

export function isTransientNetworkError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause || '');
  return /(?:429|too many requests|rate.?limit|timed?\s*out|timeout|network request failed|fetch failed|socket|econn|enotfound|503|502|504|temporarily unavailable)/i.test(
    message,
  );
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 750;
  const maxDelayMs = options.maxDelayMs ?? 4_000;
  const shouldRetry = options.shouldRetry ?? isTransientNetworkError;
  const sleep = options.sleep ?? delay;
  const random = options.random ?? Math.random;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error('Retry attempts must be an integer between 1 and 5.');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0 || !Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new Error('Retry delays must be non-negative finite numbers.');
  }

  let lastCause: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (cause) {
      lastCause = cause;
      if (attempt === maxAttempts || !shouldRetry(cause)) throw cause;
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const jitterMultiplier = 0.75 + Math.max(0, Math.min(1, random())) * 0.5;
      await sleep(Math.round(exponentialDelay * jitterMultiplier));
    }
  }
  throw lastCause;
}

export function exponentialBackoffDelay(
  baseDelayMs: number,
  consecutiveFailures: number,
  maxDelayMs = 60_000,
): number {
  if (!Number.isFinite(baseDelayMs) || baseDelayMs <= 0) {
    throw new Error('Polling delay must be positive.');
  }
  const failures = Math.max(0, Math.min(10, Math.floor(consecutiveFailures)));
  return Math.min(maxDelayMs, baseDelayMs * (2 ** failures));
}
