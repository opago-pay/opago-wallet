import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import { appConfig, assertSafeRemoteUrl } from './config';
import { fetchJson } from './http';

const TINYBARS_PER_HBAR = 100_000_000n;
const ACCOUNT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;

interface MirrorAccount {
  account?: string | null;
  deleted?: boolean | null;
  balance?: { balance?: number | string | null } | null;
  key?: { _type?: string | null; key?: string | null } | null;
}

interface MirrorAccountsResponse {
  accounts?: MirrorAccount[];
}

export interface HederaAccountSnapshot {
  accountId: string;
  publicKey: string;
  balanceTinybars: string;
  balanceHbar: string;
  hashscanUrl: string;
}

export interface HederaTransferResult {
  transactionId: string;
  status: string;
  amountHbar: string;
  recipientAccountId: string;
  hashscanUrl: string;
}

function parsePublicKey(publicKey: string | PublicKey): PublicKey {
  if (publicKey instanceof PublicKey) return publicKey;
  const normalized = publicKey.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) {
    return PublicKey.fromStringED25519(normalized);
  }
  return PublicKey.fromString(normalized);
}

export function normalizeHederaPublicKey(publicKey: string | PublicKey): string {
  const normalized = parsePublicKey(publicKey).toStringRaw().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Hedera public key must be an Ed25519 key.');
  }
  return normalized;
}

function parsePositiveHbar(rawAmount: string, label: string): bigint {
  const normalized = rawAmount.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) throw new Error(label + ' must use at most 8 decimal places.');
  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] || '').padEnd(8, '0') || '0');
  const tinybars = whole * TINYBARS_PER_HBAR + fractional;
  if (tinybars <= 0n) throw new Error(label + ' must be greater than zero.');
  return tinybars;
}

export function parseHederaTestTransferTinybars(rawAmount: string): bigint {
  const tinybars = parsePositiveHbar(rawAmount, 'HBAR amount');
  const maximum = parsePositiveHbar(
    appConfig.hederaMaxTestTransferHbar,
    'Configured Hedera test-transfer limit',
  );
  if (tinybars > maximum) {
    throw new Error(
      'HBAR amount exceeds the test-transfer limit of ' +
        appConfig.hederaMaxTestTransferHbar +
        ' HBAR.',
    );
  }
  return tinybars;
}

function formatTinybars(tinybars: string): string {
  if (!/^\d+$/.test(tinybars)) return '0';
  const value = BigInt(tinybars);
  const whole = value / TINYBARS_PER_HBAR;
  const fractional = (value % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return fractional ? whole + '.' + fractional : whole.toString();
}

function parseAccountId(rawAccountId: string, label: string): string {
  const normalized = rawAccountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error(label + ' must use the numeric 0.0.x testnet format.');
  }
  return AccountId.fromString(normalized).toString();
}

export async function findHederaTestnetAccount(
  publicKey: string | PublicKey,
): Promise<HederaAccountSnapshot | null> {
  if (appConfig.hederaNetwork !== 'testnet') {
    throw new Error('Hedera account discovery is restricted to testnet.');
  }
  const normalizedPublicKey = normalizeHederaPublicKey(publicKey);
  const mirrorBase = assertSafeRemoteUrl(
    appConfig.hederaMirrorNodeUrl,
    'Hedera testnet mirror node',
  );
  const url = new URL('/api/v1/accounts', mirrorBase);
  url.searchParams.set('account.publickey', normalizedPublicKey);
  url.searchParams.set('balance', 'true');
  url.searchParams.set('limit', '100');

  const response = await fetchJson<MirrorAccountsResponse>(
    url.toString(),
    { headers: { accept: 'application/json' } },
    { purpose: 'Hedera testnet account lookup', timeoutMs: 15_000 },
  );
  const matches = (response.accounts || [])
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
      'More than one Hedera testnet account uses this key. Configure a unique account before transferring.',
    );
  }

  const accountId = parseAccountId(matches[0].account as string, 'Hedera account ID');
  const rawBalance = String(matches[0].balance?.balance ?? '0');
  const balanceTinybars = /^\d+$/.test(rawBalance) ? rawBalance : '0';
  return {
    accountId,
    publicKey: normalizedPublicKey,
    balanceTinybars,
    balanceHbar: formatTinybars(balanceTinybars),
    hashscanUrl: 'https://hashscan.io/testnet/account/' + accountId,
  };
}

export async function sendHederaTestnetTransfer(input: {
  sourceAccountId: string;
  recipientAccountId: string;
  amountHbar: string;
  privateKey: PrivateKey;
}): Promise<HederaTransferResult> {
  if (appConfig.hederaNetwork !== 'testnet') {
    throw new Error('HBAR transfers in Phase 1 are restricted to Hedera testnet.');
  }
  const sourceAccountId = parseAccountId(input.sourceAccountId, 'Source account ID');
  const recipientAccountId = parseAccountId(input.recipientAccountId, 'Recipient account ID');
  if (sourceAccountId === recipientAccountId) {
    throw new Error('Source and recipient Hedera accounts must be different.');
  }
  const tinybars = parseHederaTestTransferTinybars(input.amountHbar);
  const client = Client.forTestnet();
  client.setOperator(sourceAccountId, input.privateKey);
  client.setDefaultMaxTransactionFee(Hbar.fromTinybars(TINYBARS_PER_HBAR.toString()));

  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(sourceAccountId, Hbar.fromTinybars((-tinybars).toString()))
      .addHbarTransfer(recipientAccountId, Hbar.fromTinybars(tinybars.toString()))
      .setTransactionMemo('Opago Phase 1 Android testnet transfer')
      .setMaxTransactionFee(Hbar.fromTinybars(TINYBARS_PER_HBAR.toString()))
      .execute(client);
    const receipt = await response.getReceipt(client);
    const status = receipt.status.toString();
    if (status !== 'SUCCESS') throw new Error('Hedera testnet returned status ' + status + '.');
    const transactionId = response.transactionId.toString();
    return {
      transactionId,
      status,
      amountHbar: formatTinybars(tinybars.toString()),
      recipientAccountId,
      hashscanUrl: 'https://hashscan.io/testnet/transaction/' + encodeURIComponent(transactionId),
    };
  } finally {
    client.close();
  }
}
