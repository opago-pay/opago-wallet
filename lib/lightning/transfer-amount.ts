/** SDK 0.12+ totalValue includes OTHER participants. Never fall back to it. */
export function sparkTransferAmount(transfer: {
  transferDirection?: unknown; valueReceivedByWallet?: unknown; valueSentByWallet?: unknown;
}): number {
  const value = transfer.transferDirection === 'INCOMING' ? transfer.valueReceivedByWallet
    : transfer.transferDirection === 'OUTGOING' ? transfer.valueSentByWallet : undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2_100_000_000_000_000) {
    throw new Error('Spark wallet transfer amount is unavailable.');
  }
  return value;
}
