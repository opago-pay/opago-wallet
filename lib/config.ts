import { clusterApiUrl } from '@solana/web3.js';

type SparkNetwork = 'MAINNET' | 'REGTEST';
export type HederaNetwork = 'testnet' | 'mainnet';
export type HederaBuildProfile = 'testnet' | 'mainnet';

const HEDERA_MIRROR_NODE_URLS: Readonly<Record<HederaNetwork, string>> = Object.freeze({
  testnet: 'https://testnet.mirrornode.hedera.com',
  mainnet: 'https://mainnet.mirrornode.hedera.com',
});

export interface HederaBuildPolicyInput {
  network?: string;
  buildProfile?: string;
  mainnetEnabled: boolean;
  mirrorNodeUrl?: string;
  maxTransferHbar?: string;
  legacyMaxTestTransferHbar?: string;
  checkoutContractId?: string;
  checkoutRuntimeSha256?: string;
}

export interface HederaBuildPolicy {
  network: HederaNetwork;
  buildProfile: HederaBuildProfile;
  mirrorNodeUrl: string;
  maxTransferHbar: string;
  checkoutContractId: string;
  checkoutRuntimeSha256: string;
}

export function resolveHederaMainnetEnabled(
  legacyGlobalValue?: string,
  hederaValue?: string,
): boolean {
  for (const [name, value] of [
    ['EXPO_PUBLIC_ENABLE_MAINNET', legacyGlobalValue],
    ['EXPO_PUBLIC_ENABLE_HEDERA_MAINNET', hederaValue],
  ] as const) {
    if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') {
      throw new Error(name + ' must be true or false.');
    }
  }
  return legacyGlobalValue === 'true' || hederaValue === 'true';
}

export function resolveHederaBuildPolicy(
  input: HederaBuildPolicyInput,
): HederaBuildPolicy {
  const networkValue = input.network || 'testnet';
  if (networkValue !== 'testnet' && networkValue !== 'mainnet') {
    throw new Error('EXPO_PUBLIC_HEDERA_NETWORK must be testnet or mainnet.');
  }
  const network = networkValue as HederaNetwork;
  const profileValue = input.buildProfile || 'testnet';
  if (profileValue !== 'testnet' && profileValue !== 'mainnet') {
    throw new Error('EXPO_PUBLIC_HEDERA_BUILD_PROFILE must be testnet or mainnet.');
  }
  const buildProfile = profileValue as HederaBuildProfile;
  if (network === 'mainnet' && !input.mainnetEnabled) {
    throw new Error(
      'Hedera mainnet requires EXPO_PUBLIC_HEDERA_NETWORK=mainnet and EXPO_PUBLIC_ENABLE_HEDERA_MAINNET=true.',
    );
  }
  if (buildProfile !== network) {
    throw new Error(
      'EXPO_PUBLIC_HEDERA_BUILD_PROFILE must match EXPO_PUBLIC_HEDERA_NETWORK.',
    );
  }

  const maxTransferHbar =
    input.maxTransferHbar ||
    (network === 'testnet' ? input.legacyMaxTestTransferHbar || '1' : '');
  if (network === 'mainnet' && !maxTransferHbar) {
    throw new Error(
      'EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR is required for Hedera mainnet builds.',
    );
  }
  if (
    !/^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.test(maxTransferHbar) ||
    /^0(?:\.0+)?$/.test(maxTransferHbar)
  ) {
    throw new Error(
      'EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR must be a positive HBAR amount with at most 8 decimals.',
    );
  }

  const mirrorNodeUrl = input.mirrorNodeUrl || HEDERA_MIRROR_NODE_URLS[network];
  let parsedMirrorNodeUrl: URL;
  try {
    parsedMirrorNodeUrl = new URL(mirrorNodeUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL must be a valid HTTPS URL.');
  }
  const officialMirrorNodeUrl = new URL(HEDERA_MIRROR_NODE_URLS[network]);
  if (
    parsedMirrorNodeUrl.protocol !== 'https:' ||
    parsedMirrorNodeUrl.username ||
    parsedMirrorNodeUrl.password ||
    parsedMirrorNodeUrl.hostname.toLowerCase() !== officialMirrorNodeUrl.hostname ||
    (parsedMirrorNodeUrl.pathname !== '/' && parsedMirrorNodeUrl.pathname !== '') ||
    parsedMirrorNodeUrl.search ||
    parsedMirrorNodeUrl.hash
  ) {
    throw new Error(
      'EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL must use the official ' +
        network +
        ' Mirror Node origin.',
    );
  }

  const checkoutContractId = input.checkoutContractId || '';
  const checkoutRuntimeSha256 = input.checkoutRuntimeSha256 || '';
  if (network === 'mainnet' && !/^0\.0\.[1-9]\d*$/.test(checkoutContractId)) {
    throw new Error(
      'A verified EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID is required for Hedera mainnet builds.',
    );
  }
  if (
    network === 'mainnet' &&
    !/^(?:0x)?[0-9a-fA-F]{64}$/.test(checkoutRuntimeSha256)
  ) {
    throw new Error(
      'A pinned EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 is required for Hedera mainnet builds.',
    );
  }

  return Object.freeze({
    network,
    buildProfile,
    mirrorNodeUrl,
    maxTransferHbar,
    checkoutContractId,
    checkoutRuntimeSha256,
  });
}

const SOLANA_USDC_MINTS = Object.freeze({
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
});

const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const mainnetEnabled = process.env.EXPO_PUBLIC_ENABLE_MAINNET === 'true';
const hederaMainnetEnabled = resolveHederaMainnetEnabled(
  process.env.EXPO_PUBLIC_ENABLE_MAINNET,
  process.env.EXPO_PUBLIC_ENABLE_HEDERA_MAINNET,
);
const insecureHttpEnabled = isDevelopment && process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === 'true';
const hederaBuildPolicy = resolveHederaBuildPolicy({
  network: process.env.EXPO_PUBLIC_HEDERA_NETWORK,
  buildProfile: process.env.EXPO_PUBLIC_HEDERA_BUILD_PROFILE,
  mainnetEnabled: hederaMainnetEnabled,
  mirrorNodeUrl: process.env.EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL,
  maxTransferHbar: process.env.EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR,
  legacyMaxTestTransferHbar: process.env.EXPO_PUBLIC_HEDERA_MAX_TEST_TRANSFER_HBAR,
  checkoutContractId: process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID,
  checkoutRuntimeSha256: process.env.EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256,
});
const expectedSolanaUsdcMint = mainnetEnabled
  ? SOLANA_USDC_MINTS.mainnet
  : SOLANA_USDC_MINTS.devnet;
const configuredSolanaUsdcMint = process.env.EXPO_PUBLIC_USDC_MINT || expectedSolanaUsdcMint;

if (configuredSolanaUsdcMint !== expectedSolanaUsdcMint) {
  throw new Error(
    'EXPO_PUBLIC_USDC_MINT must match the official Circle USDC mint for the selected Solana network.',
  );
}

export const appConfig = Object.freeze({
  isDevelopment,
  isMainnet: mainnetEnabled,
  isHederaMainnet: hederaMainnetEnabled,
  allowInsecureHttp: insecureHttpEnabled,
  solanaRpcUrl:
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
    clusterApiUrl(mainnetEnabled ? 'mainnet-beta' : 'devnet'),
  solanaMaxTestTransferSol: process.env.EXPO_PUBLIC_SOLANA_MAX_TEST_TRANSFER_SOL || '1',
  solanaMaxTestTransferUsdc: process.env.EXPO_PUBLIC_SOLANA_MAX_TEST_TRANSFER_USDC || '100',
  sparkNetwork: (mainnetEnabled ? 'MAINNET' : 'REGTEST') as SparkNetwork,
  eIdBackendUrl: process.env.EXPO_PUBLIC_EID_BACKEND_URL || '',
  hederaNetwork: hederaBuildPolicy.network,
  hederaBuildProfile: hederaBuildPolicy.buildProfile,
  hederaMirrorNodeUrl: hederaBuildPolicy.mirrorNodeUrl,
  hederaMaxTransferHbar: hederaBuildPolicy.maxTransferHbar,
  hederaCheckoutContractId: hederaBuildPolicy.checkoutContractId,
  hederaCheckoutRuntimeSha256: hederaBuildPolicy.checkoutRuntimeSha256,
  importSolanaKeyToPrivy: process.env.EXPO_PUBLIC_IMPORT_SOLANA_TO_PRIVY === 'true',
  maxLightningFeeSats: Math.max(
    1,
    Number.parseInt(process.env.EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS || '100', 10) || 100,
  ),
  usdcMint: configuredSolanaUsdcMint,
});

function isPrivateDevelopmentHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '10.0.2.2' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    /^127\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^\[?(::1|f[cd][a-f0-9:]*|fe8[0-9a-f][a-f0-9:]*)\]?$/.test(hostname)
  );
}

export function assertSafeRemoteUrl(rawUrl: string, purpose: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(purpose + ' returned an invalid URL.');
  }

  if (url.username || url.password) {
    throw new Error(purpose + ' URLs must not contain credentials.');
  }
  const isPrivateHost = isPrivateDevelopmentHost(url.hostname.toLowerCase());
  if (isPrivateHost) {
    if (
      appConfig.allowInsecureHttp &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    ) return url;
    throw new Error(purpose + ' uses a local/private host. This requires the explicit development flag.');
  }
  if (url.protocol === 'https:') return url;

  throw new Error(purpose + ' must use HTTPS. Local HTTP requires the explicit development flag.');
}

export function assertMainnetPaymentsEnabled(action: string): void {
  if (!appConfig.isMainnet) {
    throw new Error(
      action +
        ' is disabled outside an explicitly enabled mainnet build. Set EXPO_PUBLIC_ENABLE_MAINNET=true only when real-fund execution is intended.',
    );
  }
}

export function requireEIdBackendUrl(): string {
  if (!appConfig.eIdBackendUrl) {
    throw new Error('EXPO_PUBLIC_EID_BACKEND_URL is required for eID verification.');
  }
  return assertSafeRemoteUrl(appConfig.eIdBackendUrl, 'eID backend').toString().replace(/\/$/, '');
}
