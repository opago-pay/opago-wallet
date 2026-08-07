import { parseHederaAccountId } from './config';
import { normalizeHederaTransactionIdForMirror } from './mirror';

const HASHSCAN_TESTNET_BASE = 'https://hashscan.io/testnet';

export function getHederaAccountExplorerUrl(accountId: string): string {
  return HASHSCAN_TESTNET_BASE + '/account/' + parseHederaAccountId(accountId);
}

export function canonicalHederaTransactionId(transactionId: string): string {
  const mirrorId = normalizeHederaTransactionIdForMirror(transactionId);
  const match = /^(\d+\.\d+\.\d+)-(\d+)-(\d{9})$/.exec(mirrorId);
  if (!match) throw new Error('Hedera transaction ID is invalid.');
  return match[1] + '@' + match[2] + '.' + match[3];
}

export function getHederaTransactionExplorerUrl(transactionId: string): string {
  return (
    HASHSCAN_TESTNET_BASE +
    '/transaction/' +
    encodeURIComponent(canonicalHederaTransactionId(transactionId))
  );
}

export async function openHederaExplorerUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'hashscan.io' ||
    !url.pathname.startsWith('/testnet/')
  ) {
    throw new Error('Only Hedera testnet HashScan links can be opened.');
  }
  const Linking = await import('expo-linking');
  await Linking.openURL(url.toString());
}
