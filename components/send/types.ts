import type { AtomiqSolanaSigner, AtomiqSwap } from '@/lib/atomiq';
import type { LNURLPResponse } from '@/lib/lnurl-safe';
import type { OcpOption, OcpResponse } from '@/lib/ocp-safe';

export type PaymentSource = 'spark' | 'solana' | 'usdc';
export type PaymentCurrency = 'SAT' | 'EUR';

export interface WalletBalances {
  spark: number;
  sol: number;
  usdc: number;
}

export interface PendingEId {
  lnurl: LNURLPResponse;
  amountSats: number;
}

export interface OcpState {
  callbackUrl: string;
  quote: OcpResponse;
}

export interface BridgeQuote {
  swap: AtomiqSwap;
  signer: AtomiqSolanaSigner;
  amountSats: number;
  sourceAsset: 'SOL' | 'USDC';
  sourceCost: number;
  expiresAt: number;
}

export type { OcpOption };
