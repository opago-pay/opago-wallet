import { sats } from './amount';
import type { BitcoinOperation } from './store';

/** Pending static deposits are separate from the shared spendable BTC balance. */
export function pendingOnchainDepositSats(operations: readonly BitcoinOperation[]): number | null {
  try {
    const deposits = new Map<string, BitcoinOperation>();
    for (const item of operations) if (item.kind === 'deposit') deposits.set(item.id, item);
    let total = 0n;
    for (const item of deposits.values()) {
      if (!['confirmed', 'failed', 'aborted'].includes(item.state)) total += BigInt(sats(item.amountSats));
    }
    return sats(total);
  } catch {
    return null;
  }
}
