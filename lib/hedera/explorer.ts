import { HEDERA_NETWORK, parseHederaAccountId } from './config';
import { normalizeHederaTransactionIdForMirror } from './mirror';
import type { HederaNetwork } from '../config';

export function getHederaHashscanBaseUrl(network: HederaNetwork): string {
  return 'https://hashscan.io/' + network;
}

const HASHSCAN_BASE = getHederaHashscanBaseUrl(HEDERA_NETWORK);

export function getHederaAccountExplorerUrl(accountId: string): string {
  return HASHSCAN_BASE + '/account/' + parseHederaAccountId(accountId);
}

export function getHederaContractExplorerUrl(contractId: string): string {
  const normalized = contractId.trim();
  if (!/^0\.0\.[1-9]\d*$/.test(normalized)) {
    throw new Error('Hedera contract ID must use numeric 0.0.x format.');
  }
  return HASHSCAN_BASE + '/contract/' + normalized;
}

export function canonicalHederaTransactionId(transactionId: string): string {
  const mirrorId = normalizeHederaTransactionIdForMirror(transactionId);
  const match = /^(\d+\.\d+\.\d+)-(\d+)-(\d{9})$/.exec(mirrorId);
  if (!match) throw new Error('Hedera transaction ID is invalid.');
  return match[1] + '@' + match[2] + '.' + match[3];
}

export function getHederaTransactionExplorerUrl(transactionId: string): string {
  return (
    HASHSCAN_BASE +
    '/transaction/' +
    encodeURIComponent(canonicalHederaTransactionId(transactionId))
  );
}

export function validateHederaExplorerUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'hashscan.io' ||
    !url.pathname.startsWith('/' + HEDERA_NETWORK + '/')
  ) {
    throw new Error('Only Hedera ' + HEDERA_NETWORK + ' HashScan links can be opened.');
  }
  return url.toString();
}
