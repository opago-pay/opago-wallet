import { AccountId, Client } from '@hiero-ledger/sdk';
import { appConfig, assertSafeRemoteUrl, type HederaNetwork } from '../config';

export const HEDERA_NETWORK = appConfig.hederaNetwork;
export const HEDERA_CHAIN_ID = getHederaChainId(HEDERA_NETWORK);
export const HEDERA_NETWORK_LABEL = 'Hedera ' + HEDERA_NETWORK;
export const HEDERA_NETWORK_BADGE = HEDERA_NETWORK.toUpperCase();
export const TINYBARS_PER_HBAR = 100_000_000n;
export const MAX_HEDERA_TRANSACTION_FEE_TINYBARS = 100_000_000n;
export const HEDERA_SDK_REQUEST_TIMEOUT_MS = 20_000;
export const HEDERA_SDK_GRPC_DEADLINE_MS = 10_000;
export const HEDERA_SDK_MAX_ATTEMPTS = 3;

const ACCOUNT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;

const OFFICIAL_MIRROR_NODE_HOSTS = Object.freeze({
  testnet: 'testnet.mirrornode.hedera.com',
  mainnet: 'mainnet.mirrornode.hedera.com',
});

export function getHederaChainId(network: HederaNetwork): bigint {
  return network === 'mainnet' ? 295n : 296n;
}

export function assertHederaMirrorNodeMatchesNetwork(
  network: HederaNetwork,
  url: URL,
): void {
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('Hedera Mirror Node URL must not contain a path.');
  }
  if (url.hostname.toLowerCase() !== OFFICIAL_MIRROR_NODE_HOSTS[network]) {
    throw new Error(
      'Hedera Mirror Node URL does not match the configured ' + network + ' network.',
    );
  }
}

export function assertHederaNetwork(): void {
  if (appConfig.hederaNetwork !== HEDERA_NETWORK) {
    throw new Error('Hedera network configuration changed after application startup.');
  }
  if (HEDERA_NETWORK === 'mainnet' && !appConfig.isHederaMainnet) {
    throw new Error('Hedera mainnet is disabled for this build.');
  }
}

export function createHederaClient(): Client {
  assertHederaNetwork();
  return HEDERA_NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
}

export function parseHederaAccountId(rawAccountId: string, label = 'Hedera account ID'): string {
  const normalized = rawAccountId.trim();
  if (!ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error(label + ' must use the numeric 0.0.x format.');
  }
  return AccountId.fromString(normalized).toString();
}

export function getHederaMirrorNodeBaseUrl(): URL {
  assertHederaNetwork();
  const url = assertSafeRemoteUrl(
    appConfig.hederaMirrorNodeUrl,
    HEDERA_NETWORK_LABEL + ' Mirror Node',
  );
  assertHederaMirrorNodeMatchesNetwork(HEDERA_NETWORK, url);
  url.pathname = '/';
  return url;
}

export const configuredHederaMaxTransferHbar = appConfig.hederaMaxTransferHbar;
