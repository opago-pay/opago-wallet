import { decodeLNURL } from './lnurl-safe';
import { assertSafeRemoteUrl } from './config';
import { fetchJson } from './http';

export type OcpAsset = 'SAT' | 'SOL' | 'USDC';
export type OcpMethod = 'lightning' | 'solana';

export interface OcpOption {
  asset: OcpAsset;
  chain: string;
  amount: number;
  fee: number;
  method: OcpMethod;
}

export interface OcpResponse {
  merchantName: string;
  fiatAmount: number;
  fiatCurrency: string;
  quoteId: string;
  expiresAt: number;
  transferAmounts: OcpOption[];
}

export type OcpExecutionPayload =
  | { type: 'lightning'; quoteId: string; asset: 'SAT'; amount: number; pr: string }
  | { type: 'solana'; quoteId: string; asset: 'SOL' | 'USDC'; amount: number; destination: string };

function isAsset(value: unknown): value is OcpAsset {
  return value === 'SAT' || value === 'SOL' || value === 'USDC';
}

function validateOption(value: unknown): OcpOption {
  if (!value || typeof value !== 'object') throw new Error('OCP option is invalid.');
  const option = value as Partial<OcpOption>;
  if (
    !isAsset(option.asset) ||
    (option.method !== 'lightning' && option.method !== 'solana') ||
    typeof option.chain !== 'string' ||
    !Number.isFinite(option.amount) ||
    Number(option.amount) <= 0 ||
    !Number.isFinite(option.fee) ||
    Number(option.fee) < 0
  ) throw new Error('OCP option contains invalid fields.');
  if (option.method === 'lightning' && option.asset !== 'SAT') {
    throw new Error('Lightning OCP options must use SAT.');
  }
  if (option.method === 'solana' && option.asset === 'SAT') {
    throw new Error('Solana OCP options must use SOL or USDC.');
  }
  return option as OcpOption;
}

export async function resolveOcpUrl(scannedValue: string): Promise<string | null> {
  const parameter = scannedValue.match(/[?&]lightning=([^&#]+)/i)?.[1];
  const candidate = parameter ? decodeURIComponent(parameter) : scannedValue.trim();
  if (!candidate.toLowerCase().startsWith('lnurl1')) return null;
  try {
    return assertSafeRemoteUrl(decodeLNURL(candidate), 'OCP endpoint').toString();
  } catch {
    return null;
  }
}

export async function fetchOcpOptions(apiUrl: string): Promise<OcpResponse> {
  const data = await fetchJson<Partial<OcpResponse>>(
    apiUrl,
    {},
    { purpose: 'OCP quote endpoint' },
  );
  if (
    typeof data.merchantName !== 'string' ||
    !Number.isFinite(data.fiatAmount) ||
    Number(data.fiatAmount) <= 0 ||
    typeof data.fiatCurrency !== 'string' ||
    typeof data.quoteId !== 'string' ||
    !Array.isArray(data.transferAmounts)
  ) throw new Error('Endpoint is not a valid OCP quote.');

  const expiresAt = Number(data.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('OCP quote is expired or has no valid expiry.');
  }
  return {
    merchantName: data.merchantName,
    fiatAmount: Number(data.fiatAmount),
    fiatCurrency: data.fiatCurrency,
    quoteId: data.quoteId,
    expiresAt,
    transferAmounts: data.transferAmounts.map(validateOption),
  };
}

export async function fetchOcpExecutionPayload(
  callbackUrl: string,
  quote: OcpResponse,
  option: OcpOption,
): Promise<OcpExecutionPayload> {
  if (quote.expiresAt <= Date.now()) throw new Error('OCP quote expired.');
  const callback = assertSafeRemoteUrl(callbackUrl, 'OCP execution endpoint');
  callback.searchParams.set('quoteId', quote.quoteId);
  callback.searchParams.set('method', option.method);
  callback.searchParams.set('asset', option.asset);

  const data = await fetchJson<Partial<OcpExecutionPayload>>(
    callback.toString(),
    {},
    { purpose: 'OCP execution endpoint' },
  );
  if (
    data.quoteId !== quote.quoteId ||
    data.asset !== option.asset ||
    data.type !== option.method ||
    Number(data.amount) !== option.amount
  ) throw new Error('OCP execution payload does not match the reviewed quote.');

  if (data.type === 'lightning' && typeof data.pr === 'string') return data as OcpExecutionPayload;
  if (data.type === 'solana' && typeof data.destination === 'string') return data as OcpExecutionPayload;
  throw new Error('OCP execution payload is incomplete.');
}
