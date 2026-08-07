import type { AtomiqSolanaSigner, AtomiqSwap } from '@/lib/atomiq';
import type { LNURLPResponse } from '@/lib/lnurl-safe';
import type { OcpOption, OcpResponse } from '@/lib/ocp-safe';
import type { HederaCheckoutRequest } from '@/lib/hedera/checkout';

export type PaymentSource = 'spark' | 'solana' | 'usdc' | 'hedera';
export type PaymentCurrency = 'SAT' | 'EUR';

export interface WalletBalances {
  spark: number;
  sol: number;
  usdc: number;
  hbarTinybars: bigint;
}

export interface PendingHederaPayment {
  recipientAccountId: string;
  amountTinybars: bigint;
  amountHbar: string;
  checkoutRequest?: HederaCheckoutRequest;
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
