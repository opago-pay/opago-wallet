import type { PrivateKey } from '@hiero-ledger/sdk';
import { HEDERA_NETWORK, parseHederaAccountId } from './config';
import { normalizeHederaPublicKey } from './keys';
import { strictFetch, readBoundedText } from '../strict-http-transport';

export const ACTIVATION_POLL_INTERVAL_MS = 15_000;
export const ACTIVATION_MAX_WAIT_MS = 5 * 60_000;

export type ActivationStatus = 'pending' | 'confirmed' | 'failed' | 'needs_review';
export interface ActivationJob {
  job_id: string;
  status: ActivationStatus;
  transaction_id: string | null;
  account_id: string | null;
  error_code: string | null;
  retry_after: string | null;
}

interface ActivationChallenge {
  challenge_id: string;
  message: string;
  expires_at: string;
}

export class ActivationApiError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly retryAfter: string | null = null,
    readonly nextReleaseAt: string | null = null,
  ) {
    super(code);
    this.name = 'ActivationApiError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RFC3339_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function getActivationApiUrl(): URL | null {
  const raw = process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('Hedera activation API URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !url.hostname.toLowerCase().endsWith('.opago.com')) {
    throw new Error('Hedera activation API must use an Opago HTTPS origin.');
  }
  return url;
}

export function validateActivationChallenge(
  value: unknown,
  expectedPublicKey: string,
  now = Date.now(),
): ActivationChallenge {
  if (!value || typeof value !== 'object') throw new Error('Hedera activation challenge is invalid.');
  const challenge = value as Partial<ActivationChallenge>;
  if (typeof challenge.challenge_id !== 'string' || !UUID.test(challenge.challenge_id) ||
      typeof challenge.expires_at !== 'string' || !RFC3339_SECONDS.test(challenge.expires_at) ||
      typeof challenge.message !== 'string') {
    throw new Error('Hedera activation challenge is invalid.');
  }
  const expires = Date.parse(challenge.expires_at);
  if (!Number.isFinite(expires) || expires <= now || expires > now + 6 * 60_000) {
    throw new Error('Hedera activation challenge has expired or an invalid expiry.');
  }
  const lines = challenge.message.split('\n');
  if (lines.length !== 8 || lines[7] !== '' || lines[0] !== 'Opago Hedera activation' ||
      lines[1] !== 'version:1' || lines[2] !== `network:${HEDERA_NETWORK}` ||
      lines[3] !== `public_key:${normalizeHederaPublicKey(expectedPublicKey)}` ||
      !/^nonce:[0-9a-f]{64}$/.test(lines[4]) ||
      lines[5] !== `expires_at:${challenge.expires_at}` ||
      lines[6] !== `challenge_id:${challenge.challenge_id}`) {
    throw new Error('Hedera activation challenge does not match this wallet and network.');
  }
  return challenge as ActivationChallenge;
}

export function signActivationChallenge(
  challenge: ActivationChallenge,
  privateKey: PrivateKey,
  now = Date.now(),
): string {
  const publicKey = privateKey.publicKey.toStringRaw().toLowerCase();
  validateActivationChallenge(challenge, publicKey, now);
  if (privateKey.type !== 'ED25519') throw new Error('Hedera activation requires an Ed25519 wallet key.');
  const signature = Buffer.from(privateKey.sign(Buffer.from(challenge.message, 'utf8'))).toString('hex');
  if (!/^[0-9a-f]{128}$/.test(signature)) throw new Error('Hedera activation signature is invalid.');
  return signature;
}

function parseJob(value: unknown): ActivationJob {
  if (!value || typeof value !== 'object') throw new Error('Hedera activation response is invalid.');
  const job = value as Partial<ActivationJob>;
  if (typeof job.job_id !== 'string' || !UUID.test(job.job_id) ||
      !['pending', 'confirmed', 'failed', 'needs_review'].includes(job.status || '') ||
      (job.account_id !== null && typeof job.account_id !== 'string') ||
      (job.transaction_id !== null && typeof job.transaction_id !== 'string') ||
      (job.error_code !== null && typeof job.error_code !== 'string') ||
      (job.retry_after !== null && (typeof job.retry_after !== 'string' ||
        !Number.isFinite(Date.parse(job.retry_after))))) {
    throw new Error('Hedera activation response is invalid.');
  }
  if (job.status === 'confirmed') {
    if (!job.account_id) throw new Error('Confirmed Hedera activation has no account ID.');
    parseHederaAccountId(job.account_id);
  }
  return job as ActivationJob;
}

function latestRetryAfter(bodyValue: unknown, headerValue: string | null): string | null {
  const bodyTime = typeof bodyValue === 'string' ? Date.parse(bodyValue) : NaN;
  const headerTime = headerValue && /^\d+$/.test(headerValue)
    ? Date.now() + Number(headerValue) * 1000 : Date.parse(headerValue || '');
  const times = [bodyTime, headerTime].filter(value => Number.isFinite(value));
  const latest = Math.max(...times);
  return Number.isFinite(latest) && latest <= 8.64e15 ? new Date(latest).toISOString() : null;
}

async function postJson(baseUrl: URL, path: string, body: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await strictFetch(new URL(path, baseUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    }, 16_384, true);
    if (response.redirected) throw new Error('Hedera activation redirected unexpectedly.');
    const raw = await readBoundedText(response, 'Hedera activation', 16_384, controller, 16_384);
    let data: unknown;
    try { data = JSON.parse(raw); }
    catch {
      if (response.ok) throw new Error('Hedera activation response is not JSON.');
      data = null;
    }
    if (!response.ok) {
      const envelope = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
      const error = envelope && typeof envelope === 'object'
        ? envelope as Record<string, unknown> : {};
      throw new ActivationApiError(
        typeof error.code === 'string' ? error.code :
          ({ 400: 'INVALID_REQUEST', 401: 'INVALID_SIGNATURE', 404: 'JOB_NOT_FOUND', 429: 'RATE_LIMITED' }[response.status] || 'SERVICE_UNAVAILABLE'),
        error.retryable === true || response.status === 429 || response.status >= 500,
        latestRetryAfter(error.retry_after, response.headers.get('retry-after')),
        typeof error.next_release_at === 'string' ? error.next_release_at : null,
      );
    }
    return data;
  } catch (cause) {
    if (cause instanceof TypeError || (cause instanceof Error && cause.name === 'AbortError')) {
      throw new ActivationApiError('CONNECTION_UNAVAILABLE', true);
    }
    throw cause;
  } finally { clearTimeout(timeout); }
}

async function getSignedRequest(
  baseUrl: URL,
  privateKey: PrivateKey,
  assertCurrent: () => void,
): Promise<Record<string, string>> {
  const publicKey = privateKey.publicKey.toStringRaw().toLowerCase();
  const challenge = validateActivationChallenge(await postJson(baseUrl, '/v1/challenges', {
    network: HEDERA_NETWORK, public_key: publicKey,
  }), publicKey);
  assertCurrent();
  return {
    network: HEDERA_NETWORK,
    public_key: publicKey,
    challenge_id: challenge.challenge_id,
    signature: signActivationChallenge(challenge, privateKey),
  };
}

export async function requestHederaActivation(
  privateKey: PrivateKey,
  assertCurrent: () => void,
  existingOnly = false,
): Promise<ActivationJob> {
  const baseUrl = getActivationApiUrl();
  if (!baseUrl) throw new Error('Hedera activation is not available yet.');
  assertCurrent();
  const proof = await getSignedRequest(baseUrl, privateKey, assertCurrent);
  assertCurrent();
  const job = parseJob(await postJson(baseUrl,
    existingOnly ? '/v1/activations/status' : '/v1/activations', proof));
  assertCurrent();
  return job;
}
