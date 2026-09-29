type SparkNetwork = 'MAINNET' | 'REGTEST';
export type LightningBuildProfile = 'regtest' | 'mainnet';
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

export function resolveLightningBuildPolicy(
  legacyGlobalValue?: string,
  lightningValue?: string,
  profileValue?: string,
): { mainnetEnabled: boolean; profile: LightningBuildProfile; network: SparkNetwork } {
  for (const [name, value] of [
    ['EXPO_PUBLIC_ENABLE_MAINNET', legacyGlobalValue],
    ['EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET', lightningValue],
  ] as const) {
    if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') {
      throw new Error(name + ' must be true or false.');
    }
  }
  const mainnetEnabled = legacyGlobalValue === 'true' || lightningValue === 'true';
  const profile = profileValue || 'regtest';
  if (profile !== 'regtest' && profile !== 'mainnet') {
    throw new Error('EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE must be regtest or mainnet.');
  }
  if (mainnetEnabled !== (profile === 'mainnet')) {
    throw new Error(
      'Lightning Mainnet requires EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET=true and EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE=mainnet.',
    );
  }
  return {
    mainnetEnabled,
    profile,
    network: mainnetEnabled ? 'MAINNET' : 'REGTEST',
  };
}

export function resolveMaxLightningFeeSats(value?: string): number {
  const normalized = value === undefined || value === '' ? '100' : value;
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error('EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS must be a positive whole number.');
  }
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount > 100_000) {
    throw new Error('EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS must not exceed 100000 SAT.');
  }
  return amount;
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
  if (maxTransferHbar !== 'balance' && (
    !/^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.test(maxTransferHbar) ||
    /^0(?:\.0+)?$/.test(maxTransferHbar)
  )) {
    throw new Error(
      'EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR must be a positive HBAR amount with at most 8 decimals, or balance.',
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

const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const lightningBuildPolicy = resolveLightningBuildPolicy(
  process.env.EXPO_PUBLIC_ENABLE_MAINNET,
  process.env.EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET,
  process.env.EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE,
);
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
export const appConfig = Object.freeze({
  isDevelopment,
  isMainnet: lightningBuildPolicy.mainnetEnabled,
  isHederaMainnet: hederaMainnetEnabled,
  allowInsecureHttp: insecureHttpEnabled,
  sparkNetwork: lightningBuildPolicy.network,
  lightningBuildProfile: lightningBuildPolicy.profile,
  eIdBackendUrl: process.env.EXPO_PUBLIC_EID_BACKEND_URL || '',
  moonPayBackendUrl: process.env.EXPO_PUBLIC_MOONPAY_BACKEND_URL || '',
  hederaNetwork: hederaBuildPolicy.network,
  hederaBuildProfile: hederaBuildPolicy.buildProfile,
  hederaMirrorNodeUrl: hederaBuildPolicy.mirrorNodeUrl,
  hederaMaxTransferHbar: hederaBuildPolicy.maxTransferHbar,
  hederaCheckoutContractId: hederaBuildPolicy.checkoutContractId,
  hederaCheckoutRuntimeSha256: hederaBuildPolicy.checkoutRuntimeSha256,
  maxLightningFeeSats: resolveMaxLightningFeeSats(
    process.env.EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS,
  ),
});

export function isPrivateDevelopmentHost(hostname: string): boolean {
  // Literal IPv6 addresses are uncommon payment endpoints. Without a native
  // canonical IP parser/connection guard, fail closed for every IPv6 literal
  // (including IPv4-mapped and link-local forms) in production.
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  const ipv4 = hostname.split('.').map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second, third] = ipv4;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2)))) ||
      (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
      (first === 203 && second === 0 && third === 113);
  }
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '10.0.2.2' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
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

export function requireEIdBackendUrl(): string {
  if (!appConfig.eIdBackendUrl) {
    throw new Error('EXPO_PUBLIC_EID_BACKEND_URL is required for eID verification.');
  }
  return assertSafeRemoteUrl(appConfig.eIdBackendUrl, 'eID backend').toString().replace(/\/$/, '');
}
