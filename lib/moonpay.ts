import { appConfig, assertSafeRemoteUrl } from './config';
import { fetchJson } from './http';

export type MoonPayAsset = 'BTC' | 'HBAR';
export type MoonPayEnvironment = 'sandbox' | 'production';
export interface MoonPayAssetConfig {
  asset: MoonPayAsset;
  network: 'bitcoin' | 'hedera';
  moonpayCurrencyCode: string;
}
export interface MoonPayConfig {
  enabled: true;
  environment: MoonPayEnvironment;
  publicApiKey: string;
  assets: MoonPayAssetConfig[];
  fiatCurrencies: string[];
  redirectUrl: string;
}

function backendUrl(): string {
  if (!appConfig.moonPayBackendUrl) throw new Error('MoonPay backend is not configured.');
  const url = assertSafeRemoteUrl(appConfig.moonPayBackendUrl, 'MoonPay backend');
  if (url.search || url.hash || url.username || url.password) throw new Error('Invalid MoonPay backend URL.');
  return url.toString().replace(/\/$/, '');
}

export function validateMoonPayConfig(value: unknown): MoonPayConfig | null {
  if (!value || typeof value !== 'object') throw new Error('Invalid MoonPay configuration.');
  const input = value as Record<string, unknown>;
  if (input.enabled === false) return null;
  if (input.enabled !== true || !['sandbox', 'production'].includes(String(input.environment)) ||
      typeof input.publicApiKey !== 'string' || !/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(input.publicApiKey) ||
      !Array.isArray(input.assets) || !Array.isArray(input.fiatCurrencies) ||
      !input.fiatCurrencies.includes('EUR') || typeof input.redirectUrl !== 'string') {
    throw new Error('Invalid MoonPay configuration.');
  }
  if (input.environment === 'sandbox' && !input.publicApiKey.startsWith('pk_test_') ||
      input.environment === 'production' && !input.publicApiKey.startsWith('pk_live_')) {
    throw new Error('MoonPay key and environment do not match.');
  }
  const redirect = assertSafeRemoteUrl(input.redirectUrl, 'MoonPay redirect');
  if (redirect.protocol !== 'https:' || redirect.hash || redirect.username || redirect.password) {
    throw new Error('Invalid MoonPay redirect URL.');
  }
  const assets = input.assets.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid MoonPay asset.');
    const entry = item as Record<string, unknown>;
    if (entry.asset === 'BTC' && entry.network === 'bitcoin' && entry.moonpayCurrencyCode === 'btc')
      return { asset: 'BTC', network: 'bitcoin', moonpayCurrencyCode: 'btc' } as const;
    if (entry.asset === 'HBAR' && entry.network === 'hedera' && entry.moonpayCurrencyCode === 'hbar')
      return { asset: 'HBAR', network: 'hedera', moonpayCurrencyCode: 'hbar' } as const;
    throw new Error('Unsupported MoonPay asset configuration.');
  });
  if (new Set(assets.map(item => item.asset)).size !== assets.length) throw new Error('Duplicate MoonPay asset.');
  return {
    enabled: true,
    environment: input.environment as MoonPayEnvironment,
    publicApiKey: input.publicApiKey,
    assets,
    fiatCurrencies: ['EUR'],
    redirectUrl: redirect.toString(),
  };
}

export async function loadMoonPayConfig(): Promise<MoonPayConfig | null> {
  const raw = await fetchJson<unknown>(backendUrl() + '/api/moonpay/config', {},
    { purpose: 'MoonPay config', timeoutMs: 8_000, maxResponseChars: 8_192 });
  return validateMoonPayConfig(raw);
}

export function parseMoonPayEurAmount(raw: string): string | null {
  const value = raw.trim();
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return null;
  return value;
}

export function assertMoonPayCheckoutUrl(urlText: string, input: {
  environment: MoonPayEnvironment;
  apiKey: string;
  currencyCode: string;
  walletAddress: string;
  eurAmount: string;
  redirectUrl: string;
  signed?: boolean;
}): void {
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error('Invalid MoonPay checkout.'); }
  const host = input.environment === 'sandbox' ? 'buy-sandbox.moonpay.com' : 'buy.moonpay.com';
  const params = url.searchParams;
  if (url.protocol !== 'https:' || url.hostname !== host || url.pathname !== '/' || url.username || url.password || url.hash ||
      params.getAll('apiKey').length !== 1 || params.get('apiKey') !== input.apiKey ||
      params.getAll('currencyCode').length !== 1 || params.get('currencyCode') !== input.currencyCode ||
      params.getAll('walletAddress').length !== 1 || params.get('walletAddress') !== input.walletAddress ||
      params.getAll('baseCurrencyCode').length !== 1 || params.get('baseCurrencyCode')?.toLowerCase() !== 'eur' ||
      params.getAll('baseCurrencyAmount').length !== 1 || params.get('baseCurrencyAmount') !== input.eurAmount ||
      params.getAll('redirectURL').length !== 1 || params.get('redirectURL') !== input.redirectUrl ||
      (input.signed ? !params.get('signature') : params.has('signature'))) {
    throw new Error('MoonPay checkout parameters changed.');
  }
}

export function assertSignedMoonPayCheckout(unsignedUrl: string, signedUrl: string, signature: string): void {
  const unsigned = new URL(unsignedUrl);
  const signed = new URL(signedUrl);
  if (unsigned.origin !== signed.origin || unsigned.pathname !== signed.pathname ||
      signed.searchParams.getAll('signature').length !== 1 || signed.searchParams.get('signature') !== signature) {
    throw new Error('MoonPay signed checkout changed.');
  }
  const unsignedEntries = [...unsigned.searchParams.entries()];
  const signedEntries = [...signed.searchParams.entries()].filter(([key]) => key !== 'signature');
  if (JSON.stringify(unsignedEntries) !== JSON.stringify(signedEntries)) {
    throw new Error('MoonPay signed checkout changed.');
  }
}

export async function signMoonPayCheckout(unsignedUrl: string): Promise<string> {
  if (unsignedUrl.length > 12_000) throw new Error('Invalid MoonPay checkout.');
  const response = await fetchJson<unknown>(backendUrl() + '/api/moonpay/sign-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unsignedUrl }),
  }, { purpose: 'MoonPay checkout signature', timeoutMs: 10_000, maxResponseChars: 2_048 });
  const signature = (response as { signature?: unknown })?.signature;
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    throw new Error('Invalid MoonPay signature response.');
  }
  return signature;
}
