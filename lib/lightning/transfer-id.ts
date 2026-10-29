import { sha256 } from '@noble/hashes/sha256';

/** Stable, domain-separated UUIDv8 for every retry of the same BOLT11 hash.
 * This is public metadata, not a wallet key. Old pending journal entries are
 * still reconciled before sending; an upgrade never resubmits them. */
export function lightningTransferId(paymentHash: string): import('@buildonspark/spark-sdk').UUID {
  if (!/^[0-9a-f]{64}$/i.test(paymentHash)) throw new Error('Invalid Lightning payment hash.');
  const bytes = sha256('opago:lightning-transfer:v1:' + paymentHash.toLowerCase()).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  // Load the native SDK only on the authenticated payment path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { UUID } = require('@buildonspark/spark-sdk') as typeof import('@buildonspark/spark-sdk');
  return UUID.parse(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
}
