import { AccountId } from '@hiero-ledger/sdk';
import { appConfig, assertSafeRemoteUrl } from '../config';

export const HEDERA_NETWORK = 'testnet' as const;
export const TINYBARS_PER_HBAR = 100_000_000n;
export const MAX_HEDERA_TRANSACTION_FEE_TINYBARS = 100_000_000n;
export const HEDERA_SDK_REQUEST_TIMEOUT_MS = 20_000;
export const HEDERA_SDK_GRPC_DEADLINE_MS = 10_000;
export const HEDERA_SDK_MAX_ATTEMPTS = 3;

const ACCOUNT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;

export function assertHederaTestnet(): void {
  if (appConfig.hederaNetwork !== HEDERA_NETWORK) {
    throw new Error('Hedera wallet support is restricted to testnet.');
  }
}

export function parseHederaAccountId(rawAccountId: string, label = 'Hedera account ID'): string {
  const normalized = rawAccountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error(label + ' must use the numeric 0.0.x testnet format.');
  }
  return AccountId.fromString(normalized).toString();
}

export function getHederaMirrorNodeBaseUrl(): URL {
  assertHederaTestnet();
  const url = assertSafeRemoteUrl(
    appConfig.hederaMirrorNodeUrl,
    'Hedera testnet Mirror Node',
  );
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('Hedera Mirror Node URL must not contain a path.');
  }
  url.pathname = '/';
  return url;
}

export const configuredHederaMaxTransferHbar =
  appConfig.hederaMaxTestTransferHbar;
