import type { PublicKey } from '@hiero-ledger/sdk';
import { parseHederaAccountId } from './config';
import {
  getHederaAccountExplorerUrl,
  getHederaTransactionExplorerUrl,
} from './explorer';
import { normalizeHederaPublicKey } from './keys';
import {
  findMirrorAccountsByPublicKey,
  getMirrorAccountById,
  getMirrorTransaction,
  listMirrorTransactions,
  type MirrorAccountRecord,
  type MirrorTransactionRecord,
} from './mirror';
import { formatTinybars } from './payments';

export interface HederaAccountSnapshot {
  accountId: string;
  publicKey: string;
  balanceTinybars: bigint;
  balanceHbar: string;
  hashscanUrl: string;
}

export type HederaHistoryDirection = 'sent' | 'received';

export interface HederaHistoryItem {
  transactionId: string;
  consensusTimestamp: string;
  occurredAt: string;
  direction: HederaHistoryDirection;
  amountTinybars: bigint;
  amountHbar: string;
  feeTinybars: bigint;
  counterpartyAccountId: string | null;
  result: string;
  hashscanUrl: string;
}

export interface HederaTransactionStatus {
  transactionId: string;
  state: 'pending' | 'success' | 'failed';
  result: string | null;
  consensusTimestamp: string | null;
  hashscanUrl: string;
}

function parseExactTinybars(
  value: string | null | undefined,
  label: string,
  allowNegative = false,
): bigint {
  const normalized = value ?? '0';
  const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(normalized)) {
    throw new Error('Hedera Mirror Node returned an invalid ' + label + '.');
  }
  return BigInt(normalized);
}

function snapshotFromMirror(
  account: MirrorAccountRecord,
  expectedPublicKey?: string,
): HederaAccountSnapshot {
  if (account.deleted) throw new Error('Hedera account is deleted.');
  if (typeof account.account !== 'string') {
    throw new Error('Hedera Mirror Node returned an invalid account ID.');
  }
  const accountId = parseHederaAccountId(account.account);
  if (!account.key?.key) {
    throw new Error('Hedera account has no supported public key.');
  }
  const publicKey = normalizeHederaPublicKey(account.key.key);
  if (expectedPublicKey && publicKey !== expectedPublicKey) {
    throw new Error('Hedera account key does not match this wallet.');
  }
  const balanceTinybars = parseExactTinybars(
    account.balance?.balance,
    'HBAR balance',
  );
  return {
    accountId,
    publicKey,
    balanceTinybars,
    balanceHbar: formatTinybars(balanceTinybars),
    hashscanUrl: getHederaAccountExplorerUrl(accountId),
  };
}

export async function findHederaTestnetAccount(
  publicKey: string | PublicKey,
): Promise<HederaAccountSnapshot | null> {
  const normalizedPublicKey = normalizeHederaPublicKey(publicKey);
  const matches = (await findMirrorAccountsByPublicKey(normalizedPublicKey))
    .filter(account => !account.deleted && typeof account.account === 'string')
    .filter(account => {
      if (!account.key?.key) return false;
      try {
        return normalizeHederaPublicKey(account.key.key) === normalizedPublicKey;
      } catch {
        return false;
      }
    });

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      'More than one Hedera testnet account uses this key. A unique account is required.',
    );
  }
  return snapshotFromMirror(matches[0], normalizedPublicKey);
}

export async function loadHederaAccount(
  accountId: string,
  expectedPublicKey?: string | PublicKey,
): Promise<HederaAccountSnapshot | null> {
  const account = await getMirrorAccountById(accountId);
  if (!account) return null;
  const normalizedKey = expectedPublicKey
    ? normalizeHederaPublicKey(expectedPublicKey)
    : undefined;
  return snapshotFromMirror(account, normalizedKey);
}

export async function loadHederaBalanceTinybars(accountId: string): Promise<bigint> {
  const account = await loadHederaAccount(accountId);
  if (!account) throw new Error('Hedera testnet account was not found.');
  return account.balanceTinybars;
}

function transactionPayer(transactionId: string): string | null {
  const match = /^(\d+\.\d+\.\d+)(?:@|-)/.exec(transactionId);
  return match ? match[1] : null;
}

function consensusTimestampToIso(timestamp: string): string {
  const match = /^(\d+)\.(\d{1,9})$/.exec(timestamp);
  if (!match) {
    throw new Error('Hedera Mirror Node returned an invalid consensus timestamp.');
  }
  const milliseconds = Number(match[1]) * 1_000 +
    Number(match[2].padEnd(9, '0').slice(0, 3));
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Hedera Mirror Node returned an invalid consensus timestamp.');
  }
  return date.toISOString();
}

function findCounterparty(
  transaction: MirrorTransactionRecord,
  walletAccountId: string,
  direction: HederaHistoryDirection,
): string | null {
  const candidates = (transaction.transfers || [])
    .filter(item => typeof item.account === 'string' && item.account !== walletAccountId)
    .map(item => ({
      accountId: item.account as string,
      amount: parseExactTinybars(item.amount, 'transaction transfer', true),
    }))
    .filter(item => direction === 'sent' ? item.amount > 0n : item.amount < 0n)
    .sort((left, right) => {
      const leftAbs = left.amount < 0n ? -left.amount : left.amount;
      const rightAbs = right.amount < 0n ? -right.amount : right.amount;
      return leftAbs === rightAbs ? 0 : leftAbs > rightAbs ? -1 : 1;
    });
  return candidates[0]?.accountId || null;
}

function historyItemFromMirror(
  transaction: MirrorTransactionRecord,
  walletAccountId: string,
): HederaHistoryItem | null {
  if (
    transaction.name !== 'CRYPTOTRANSFER' ||
    transaction.scheduled ||
    (transaction.nonce != null && transaction.nonce !== 0) ||
    !transaction.transaction_id ||
    !transaction.consensus_timestamp
  ) {
    return null;
  }

  const walletDelta = (transaction.transfers || [])
    .filter(item => item.account === walletAccountId)
    .reduce(
      (total, item) =>
        total + parseExactTinybars(item.amount, 'transaction transfer', true),
      0n,
    );
  if (walletDelta === 0n) return null;

  const direction: HederaHistoryDirection = walletDelta < 0n ? 'sent' : 'received';
  const feeTinybars = parseExactTinybars(
    transaction.charged_tx_fee,
    'transaction fee',
  );
  const payer = transactionPayer(transaction.transaction_id);
  let amountTinybars = walletDelta < 0n ? -walletDelta : walletDelta;
  if (direction === 'sent' && payer === walletAccountId && amountTinybars > feeTinybars) {
    amountTinybars -= feeTinybars;
  }
  if (amountTinybars <= 0n) return null;

  return {
    transactionId: transaction.transaction_id,
    consensusTimestamp: transaction.consensus_timestamp,
    occurredAt: consensusTimestampToIso(transaction.consensus_timestamp),
    direction,
    amountTinybars,
    amountHbar: formatTinybars(amountTinybars),
    feeTinybars,
    counterpartyAccountId: findCounterparty(
      transaction,
      walletAccountId,
      direction,
    ),
    result: transaction.result || 'UNKNOWN',
    hashscanUrl: getHederaTransactionExplorerUrl(transaction.transaction_id),
  };
}

export async function loadHederaHistory(
  rawAccountId: string,
  limit = 25,
): Promise<HederaHistoryItem[]> {
  const accountId = parseHederaAccountId(rawAccountId);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const transactions = await listMirrorTransactions(accountId, safeLimit);
  const seen = new Set<string>();
  const history: HederaHistoryItem[] = [];

  for (const transaction of transactions) {
    const item = historyItemFromMirror(transaction, accountId);
    if (!item || seen.has(item.transactionId)) continue;
    seen.add(item.transactionId);
    history.push(item);
    if (history.length >= safeLimit) break;
  }
  return history;
}

export async function loadHederaTransactionStatus(
  transactionId: string,
): Promise<HederaTransactionStatus> {
  const transaction = await getMirrorTransaction(transactionId);
  if (!transaction) {
    return {
      transactionId,
      state: 'pending',
      result: null,
      consensusTimestamp: null,
      hashscanUrl: getHederaTransactionExplorerUrl(transactionId),
    };
  }
  const result = transaction.result || 'UNKNOWN';
  return {
    transactionId: transaction.transaction_id || transactionId,
    state: result === 'SUCCESS' ? 'success' : 'failed',
    result,
    consensusTimestamp: transaction.consensus_timestamp || null,
    hashscanUrl: getHederaTransactionExplorerUrl(
      transaction.transaction_id || transactionId,
    ),
  };
}
