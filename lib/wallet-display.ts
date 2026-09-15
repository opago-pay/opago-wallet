export type FriendlyPaymentStatus = 'Completed' | 'Processing' | 'Needs attention';

export function compactWalletIdentifier(value: string): string {
  const normalized = value.trim();
  const hederaAccount = /^0\.0\.(\d+)$/.exec(normalized);
  if (hederaAccount) {
    const number = hederaAccount[1];
    return 'Account ••• ' + number.slice(-5);
  }
  if (normalized.length <= 12) return normalized;
  return normalized.slice(0, 5) + '…' + normalized.slice(-5);
}

export function friendlyPaymentStatus(status: string): FriendlyPaymentStatus {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === 'success' ||
    normalized === 'confirmed' ||
    normalized === 'completed'
  ) {
    return 'Completed';
  }
  if (
    normalized === 'failed' ||
    normalized === 'action_required' ||
    normalized === 'rejected'
  ) {
    return 'Needs attention';
  }
  return 'Processing';
}

export function formatEurValue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
