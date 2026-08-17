import { appConfig } from '../config';
import {
  assertSolanaTransferLimit,
  configuredUsdcMint,
  parseSolanaPublicKey,
} from './config';
import {
  formatSolanaAssetAmount,
  parseSolanaAssetAmount,
  type SolanaAsset,
} from './amounts';

const ALLOWED_PARAMETERS = new Set(['amount', 'spl-token', 'reference', 'label', 'message', 'memo']);

export interface SolanaPaymentRequest {
  recipientAddress: string;
  asset: SolanaAsset;
  amountBaseUnits: bigint | null;
  amountDisplay: string | null;
  reference: string | null;
  label: string | null;
  message: string | null;
  memo: string | null;
}

function requiredSingleParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new Error('Solana payment request contains duplicate ' + name + '.');
  const value = values[0]?.trim() || null;
  if (values.length === 1 && value === null) {
    throw new Error('Solana payment request contains an empty ' + name + '.');
  }
  return value;
}

function parseRequestUrl(rawValue: string): URL | null {
  if (!/^solana:/i.test(rawValue)) return null;
  try {
    return new URL(rawValue);
  } catch {
    throw new Error('Solana payment request is not a valid URI.');
  }
}

export function parseSolanaPaymentRequest(
  rawValue: string,
  selectedAsset: SolanaAsset,
): SolanaPaymentRequest {
  const normalized = rawValue.trim();
  if (normalized.length === 0 || normalized.length > 2_048) {
    throw new Error('Solana payment destination is empty or too long.');
  }
  const url = parseRequestUrl(normalized);
  if (!url) {
    return {
      recipientAddress: parseSolanaPublicKey(normalized).toBase58(),
      asset: selectedAsset,
      amountBaseUnits: null,
      amountDisplay: null,
      reference: null,
      label: null,
      message: null,
      memo: null,
    };
  }
  if (url.protocol !== 'solana:' || url.username || url.password || url.hash) {
    throw new Error('Solana payment request target is invalid.');
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      throw new Error('Solana payment request contains an unsupported parameter.');
    }
  }
  const recipientRaw = decodeURIComponent(url.pathname || url.hostname).replace(/^\/+/, '');
  const recipientAddress = parseSolanaPublicKey(recipientRaw, 'Solana payment recipient').toBase58();
  const tokenMint = requiredSingleParameter(url, 'spl-token');
  const requestAsset: SolanaAsset = tokenMint ? 'USDC' : 'SOL';
  if (requestAsset !== selectedAsset) {
    throw new Error('The scanned Solana request does not match the selected asset.');
  }
  if (tokenMint && configuredUsdcMint().toBase58() !== parseSolanaPublicKey(tokenMint, 'Token mint').toBase58()) {
    throw new Error('The scanned token mint does not match the configured USDC mint.');
  }
  const amountRaw = requiredSingleParameter(url, 'amount');
  const amountBaseUnits = amountRaw
    ? assertSolanaTransferLimit(requestAsset, parseSolanaAssetAmount(amountRaw, requestAsset))
    : null;
  const referenceRaw = requiredSingleParameter(url, 'reference');
  const label = requiredSingleParameter(url, 'label');
  const message = requiredSingleParameter(url, 'message');
  const memo = requiredSingleParameter(url, 'memo');
  if ([label, message, memo].some(value => value !== null && value.length > 128)) {
    throw new Error('Solana payment request metadata is too long.');
  }
  return {
    recipientAddress,
    asset: requestAsset,
    amountBaseUnits,
    amountDisplay: amountBaseUnits === null
      ? null
      : formatSolanaAssetAmount(amountBaseUnits, requestAsset),
    reference: referenceRaw
      ? parseSolanaPublicKey(referenceRaw, 'Solana payment reference').toBase58()
      : null,
    label,
    message,
    memo,
  };
}

export function buildSolanaReceiveRequest(input: {
  recipientAddress: string;
  asset: SolanaAsset;
  amountBaseUnits?: bigint | null;
}): string {
  const recipient = parseSolanaPublicKey(input.recipientAddress).toBase58();
  const params = new URLSearchParams();
  if (input.amountBaseUnits !== null && input.amountBaseUnits !== undefined) {
    assertSolanaTransferLimit(input.asset, input.amountBaseUnits);
    params.set('amount', formatSolanaAssetAmount(input.amountBaseUnits, input.asset));
  }
  if (input.asset === 'USDC') params.set('spl-token', configuredUsdcMint().toBase58());
  params.set('label', 'Opago Wallet');
  params.set('message', appConfig.isMainnet ? 'Opago payment' : 'Opago devnet payment');
  return 'solana:' + recipient + '?' + params.toString();
}
