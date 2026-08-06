import { clusterApiUrl } from '@solana/web3.js';

type SparkNetwork = 'MAINNET' | 'REGTEST';

const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const mainnetEnabled = process.env.EXPO_PUBLIC_ENABLE_MAINNET === 'true';
const insecureHttpEnabled = isDevelopment && process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === 'true';

export const appConfig = Object.freeze({
  isDevelopment,
  isMainnet: mainnetEnabled,
  allowInsecureHttp: insecureHttpEnabled,
  solanaRpcUrl:
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL ||
    clusterApiUrl(mainnetEnabled ? 'mainnet-beta' : 'devnet'),
  sparkNetwork: (mainnetEnabled ? 'MAINNET' : 'REGTEST') as SparkNetwork,
  eIdBackendUrl: process.env.EXPO_PUBLIC_EID_BACKEND_URL || '',
  importSolanaKeyToPrivy: process.env.EXPO_PUBLIC_IMPORT_SOLANA_TO_PRIVY === 'true',
  maxLightningFeeSats: Math.max(
    1,
    Number.parseInt(process.env.EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS || '100', 10) || 100,
  ),
  usdcMint:
    process.env.EXPO_PUBLIC_USDC_MINT ||
    (mainnetEnabled ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : ''),
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
