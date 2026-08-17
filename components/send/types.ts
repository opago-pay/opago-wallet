import type { AtomiqSolanaSigner, AtomiqSwap } from '@/lib/atomiq';
import type { LNURLPResponse } from '@/lib/lnurl-safe';
import type { OcpOption, OcpResponse } from '@/lib/ocp-safe';
import type { HederaCheckoutRequest } from '@/lib/hedera/checkout';
import type { SolanaAsset } from '@/lib/solana/amounts';
import type { SolanaPaymentRequest } from '@/lib/solana/requests';
import type { SolanaTransferResult } from '@/lib/solana/payments';

export type PaymentSource = 'spark' | 'solana' | 'usdc' | 'hedera';
export type PaymentCurrency = 'SAT' | 'EUR';
export type BalanceAvailability = 'loading' | 'fresh' | 'stale' | 'unavailable';

export interface WalletBalances {
  spark: number;
  solLamports: bigint;
  usdcBaseUnits: bigint;
  hbarTinybars: bigint;
  solAvailability: BalanceAvailability;
  usdcAvailability: BalanceAvailability;
}

export interface PendingSolanaPayment {
  recipientAddress: string;
  asset: SolanaAsset;
  amountBaseUnits: bigint;
  amountDisplay: string;
  request?: SolanaPaymentRequest;
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
export type { SolanaTransferResult };
