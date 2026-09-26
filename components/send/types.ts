import type { OcpOption, OcpResponse } from '@/lib/ocp-safe';
import type { HederaCheckoutRequest } from '@/lib/hedera/checkout';
import type { PreparedSparkPayment } from '@/lib/payments';

export type PaymentSource = 'spark' | 'hedera';
export type PaymentCurrency = 'SAT' | 'EUR';

export interface WalletBalances {
  spark: number | null;
  hbarTinybars: bigint | null;
}

export interface PendingHederaPayment {
  recipientAccountId: string;
  amountTinybars: bigint;
  amountHbar: string;
  checkoutRequest?: HederaCheckoutRequest;
}

export interface PendingLightningPayment extends PreparedSparkPayment {
  recipientLabel: string;
}

export interface OcpState {
  callbackUrl: string;
  quote: OcpResponse;
}

export type { OcpOption };
