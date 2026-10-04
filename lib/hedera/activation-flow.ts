import { ActivationApiError, ACTIVATION_MAX_WAIT_MS, ACTIVATION_POLL_INTERVAL_MS, type ActivationJob } from './activation-api';
import { isTransientNetworkError } from '../retry';
import { ACTIVATION_ERROR_TEXT } from './activation-errors';

// Also covers repeated button presses in the same session. Each attempt uses
// two HTTP requests and one proof: at most 8 requests and 4 proofs per minute.
const nextAttemptByWallet = new Map<string, number>();
const renewableProofErrors = ['CHALLENGE_EXPIRED', 'CHALLENGE_USED', 'CHALLENGE_NOT_FOUND'];

export async function runHederaActivation(options: {
  scope: string;
  request(existingOnly: boolean): Promise<ActivationJob>;
  bind(accountId: string): Promise<void>;
  assertCurrent(): void;
  onJob(job: ActivationJob): void;
  onError(code: string | null): void;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const now = options.now || Date.now;
  const wait = options.wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const deadline = now() + ACTIVATION_MAX_WAIT_MS;
  let existingOnly = true;
  let job: ActivationJob | null = null;
  let attempt = 0;
  let nextAt = nextAttemptByWallet.get(options.scope) || 0;
  while (now() < deadline) {
    options.assertCurrent();
    if (nextAt >= deadline) return;
    // Recheck lock/background/wallet replacement while waiting, before signing.
    while (now() < nextAt) {
      await wait(Math.min(1000, nextAt - now()));
      options.assertCurrent();
    }
    try {
      if (job?.status !== 'confirmed') {
        nextAttemptByWallet.set(options.scope, now() + ACTIVATION_POLL_INTERVAL_MS);
        job = await options.request(existingOnly);
        options.assertCurrent();
        existingOnly = true;
        options.onJob(job);
        options.onError(job.error_code && ACTIVATION_ERROR_TEXT[job.error_code] ? job.error_code : null);
      }
      if (job.status === 'confirmed') {
        await options.bind(job.account_id!);
        options.assertCurrent();
        options.onError(null);
        return;
      }
      if (job.status === 'failed' || job.status === 'needs_review') return;
      nextAt = job.retry_after ? Date.parse(job.retry_after) : 0;
    } catch (cause) {
      options.assertCurrent();
      if (cause instanceof ActivationApiError && cause.code === 'JOB_NOT_FOUND' && existingOnly) {
        existingOnly = false;
        options.onError(null);
      } else if ((cause instanceof ActivationApiError &&
          (cause.retryable || renewableProofErrors.includes(cause.code))) || isTransientNetworkError(cause)) {
        // An activation POST might have committed despite a lost response.
        // Recover its durable job before considering another creation request.
        existingOnly = true;
        options.onError(cause instanceof ActivationApiError ? cause.code : 'CONNECTION_UNAVAILABLE');
        nextAt = cause instanceof ActivationApiError
          ? Math.max(Date.parse(cause.retryAfter || '') || 0, Date.parse(cause.nextReleaseAt || '') || 0) : 0;
      } else {
        throw cause;
      }
    }
    const backoff = Math.min(60_000, ACTIVATION_POLL_INTERVAL_MS * 2 ** Math.min(attempt++, 2));
    nextAt = Math.max(Number.isFinite(nextAt) ? nextAt : 0, now() + backoff);
    nextAttemptByWallet.set(options.scope, nextAt);
  }
}
