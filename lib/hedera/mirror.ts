import { getHederaMirrorNodeBaseUrl, parseHederaAccountId } from './config';
import { retryWithBackoff } from '../retry';

export interface MirrorAccountRecord {
  account?: string | null;
  deleted?: boolean | null;
  evm_address?: string | null;
  balance?: { balance?: string | null; timestamp?: string | null } | null;
  key?: { _type?: string | null; key?: string | null } | null;
}

export interface MirrorContractRecord {
  contract_id?: string | null;
  deleted?: boolean | null;
  evm_address?: string | null;
  runtime_bytecode?: string | null;
}

export interface MirrorTransfer {
  account?: string | null;
  amount?: string | null;
  is_approval?: boolean | null;
}

export interface MirrorTransactionRecord {
  charged_tx_fee?: string | null;
  consensus_timestamp?: string | null;
  memo_base64?: string | null;
  name?: string | null;
  nonce?: number | null;
  result?: string | null;
  scheduled?: boolean | null;
  transaction_id?: string | null;
  transfers?: MirrorTransfer[] | null;
}

interface MirrorAccountsResponse {
  accounts?: MirrorAccountRecord[];
}

interface MirrorTransactionsResponse {
  transactions?: MirrorTransactionRecord[];
}

const HEDERA_HISTORY_TRANSACTION_TYPES = [
  'CRYPTOTRANSFER',
  'ETHEREUMTRANSACTION',
] as const;

const EXACT_INTEGER_FIELDS = /("(?:amount|balance|charged_tx_fee|max_fee)"\s*:\s*)(-?\d+)(?=\s*[,}\]])/g;

function preserveExactIntegers(rawJson: string): string {
  return rawJson.replace(EXACT_INTEGER_FIELDS, '$1"$2"');
}

function mirrorErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const status = (body as { _status?: { messages?: Array<{ message?: unknown }> } })._status;
  const message = status?.messages?.find(item => typeof item.message === 'string')?.message;
  return typeof message === 'string' ? message : fallback;
}

async function fetchMirrorJson<T>(
  url: URL,
  purpose: string,
  allowNotFound = false,
): Promise<T | null> {
  return retryWithBackoff(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url.toString(), {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.redirected) throw new Error(purpose + ' redirected unexpectedly.');
      if (allowNotFound && response.status === 404) return null;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(purpose + ' returned an unexpected content type.');
      }
      const rawBody = await response.text();
      if (rawBody.length > 524_288) {
        throw new Error(purpose + ' returned an oversized response.');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(preserveExactIntegers(rawBody));
      } catch {
        throw new Error(purpose + ' returned invalid JSON.');
      }
      if (!response.ok) {
        throw new Error(mirrorErrorMessage(parsed, purpose + ' failed with HTTP ' + response.status + '.'));
      }
      return parsed as T;
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw new Error(purpose + ' timed out.');
      }
      throw cause;
    } finally {
      clearTimeout(timeout);
    }
  }, { maxAttempts: 2, baseDelayMs: 750, maxDelayMs: 1_500 });
}

function mirrorUrl(pathname: string): URL {
  const url = new URL(pathname, getHederaMirrorNodeBaseUrl());
  if (!url.pathname.startsWith('/api/v1/')) {
    throw new Error('Hedera Mirror Node path is invalid.');
  }
  return url;
}

export async function findMirrorAccountsByPublicKey(
  publicKey: string,
): Promise<MirrorAccountRecord[]> {
  const url = mirrorUrl('/api/v1/accounts');
  url.searchParams.set('account.publickey', publicKey);
  url.searchParams.set('balance', 'true');
  url.searchParams.set('limit', '100');
  const response = await fetchMirrorJson<MirrorAccountsResponse>(
    url,
    'Hedera testnet account lookup',
  );
  return response?.accounts || [];
}

export async function getMirrorAccountById(
  rawAccountId: string,
): Promise<MirrorAccountRecord | null> {
  const accountId = parseHederaAccountId(rawAccountId);
  const url = mirrorUrl('/api/v1/accounts/' + encodeURIComponent(accountId));
  return fetchMirrorJson<MirrorAccountRecord>(
    url,
    'Hedera testnet account',
    true,
  );
}

export async function listMirrorTransactions(
  rawAccountId: string,
  limit = 25,
): Promise<MirrorTransactionRecord[]> {
  const accountId = parseHederaAccountId(rawAccountId);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const results = await Promise.allSettled(
    HEDERA_HISTORY_TRANSACTION_TYPES.map(async transactionType => {
      const url = mirrorUrl('/api/v1/transactions');
      url.searchParams.set('account.id', accountId);
      url.searchParams.set('transactiontype', transactionType);
      url.searchParams.set('limit', String(safeLimit));
      url.searchParams.set('order', 'desc');
      const response = await fetchMirrorJson<MirrorTransactionsResponse>(
        url,
        'Hedera testnet ' + transactionType.toLowerCase() + ' history',
      );
      return response?.transactions || [];
    }),
  );
  const responses = results
    .filter((result): result is PromiseFulfilledResult<MirrorTransactionRecord[]> =>
      result.status === 'fulfilled')
    .map(result => result.value);
  if (responses.length === 0) {
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    throw failure.reason;
  }

  const uniqueTransactions = new Map<string, MirrorTransactionRecord>();
  for (const transaction of responses.flat()) {
    const identity = [
      transaction.transaction_id || '',
      transaction.nonce ?? 0,
      transaction.name || '',
    ].join(':');
    if (!uniqueTransactions.has(identity)) uniqueTransactions.set(identity, transaction);
  }

  return Array.from(uniqueTransactions.values())
    .sort((left, right) =>
      String(right.consensus_timestamp || '').localeCompare(
        String(left.consensus_timestamp || ''),
      ),
    )
    .slice(0, safeLimit);
}

export async function getMirrorContractById(
  rawContractId: string,
): Promise<MirrorContractRecord | null> {
  const contractId = rawContractId.trim();
  if (!/^0\.0\.[1-9]\d*$/.test(contractId)) {
    throw new Error('Hedera contract ID must use numeric 0.0.x format.');
  }
  const url = mirrorUrl('/api/v1/contracts/' + encodeURIComponent(contractId));
  return fetchMirrorJson<MirrorContractRecord>(
    url,
    'Hedera testnet checkout contract',
    true,
  );
}

export function normalizeHederaTransactionIdForMirror(transactionId: string): string {
  const normalized = transactionId.trim();
  const sdkMatch = /^(\d+\.\d+\.\d+)@(\d+)\.(\d{1,9})$/.exec(normalized);
  if (sdkMatch) {
    return sdkMatch[1] + '-' + sdkMatch[2] + '-' + sdkMatch[3].padStart(9, '0');
  }
  const mirrorMatch = /^(\d+\.\d+\.\d+)-(\d+)-(\d{1,9})$/.exec(normalized);
  if (mirrorMatch) {
    return mirrorMatch[1] + '-' + mirrorMatch[2] + '-' + mirrorMatch[3].padStart(9, '0');
  }
  throw new Error('Hedera transaction ID is invalid.');
}

export async function getMirrorTransaction(
  transactionId: string,
): Promise<MirrorTransactionRecord | null> {
  const mirrorId = normalizeHederaTransactionIdForMirror(transactionId);
  const url = mirrorUrl('/api/v1/transactions/' + encodeURIComponent(mirrorId));
  const response = await fetchMirrorJson<MirrorTransactionsResponse>(
    url,
    'Hedera testnet transaction status',
    true,
  );
  return response?.transactions?.find(item => item.nonce === 0 || item.nonce == null) || null;
}
