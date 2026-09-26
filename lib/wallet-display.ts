import { appLocale, t } from './i18n';

export type FriendlyPaymentStatus = 'Completed' | 'Processing' | 'Needs attention';

export function compactWalletIdentifier(value: string): string {
  const normalized = value.trim();
  const hederaAccount = /^0\.0\.(\d+)$/.exec(normalized);
  if (hederaAccount) {
    const number = hederaAccount[1];
    return t('Account ••• {number}', { number: number.slice(-5) });
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
  return new Intl.NumberFormat(appLocale(), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function paymentHistoryTitle(direction: 'incoming' | 'outgoing', status: string): string {
  if (friendlyPaymentStatus(status) === 'Completed') {
    return direction === 'incoming' ? t('Money received') : t('Payment sent');
  }
  return direction === 'incoming' ? t('Incoming payment') : t('Outgoing payment');
}

export function paymentHistoryStatus(direction: 'incoming' | 'outgoing', asset: string, status: string, route?: 'lightning' | 'onchain'): string {
  const friendly = friendlyPaymentStatus(status);
  if (direction === 'outgoing' && asset === 'SAT' && route === 'onchain' && status === 'broadcast') {
    return 'Broadcast to the Bitcoin network';
  }
  return direction === 'outgoing' && asset === 'SAT' && friendly === 'Processing'
    ? 'Status unknown' : friendly;
}

export type BitcoinOperationNotice = {
  title: string;
  description: string;
  destination: 'deposits' | 'activity';
};

export function bitcoinOperationNotice(operations: ReadonlyArray<{ kind: 'deposit' | 'withdrawal'; state: string }>): BitcoinOperationNotice | null {
  if (operations.some(item => item.kind === 'deposit' && item.state === 'action_required')) {
    return {
      title: 'Bitcoin deposit needs your approval',
      description: 'Review the claim fee before these Bitcoin become available.',
      destination: 'deposits',
    };
  }
  if (operations.some(item => item.kind === 'withdrawal' && ['checking', 'pending'].includes(item.state))) {
    return {
      title: 'Payment status unknown',
      description: 'Do not send it again. Open activity to check this payment.',
      destination: 'activity',
    };
  }
  if (operations.some(item => item.kind === 'withdrawal' && item.state === 'broadcast')) {
    return {
      title: 'Broadcast to the Bitcoin network',
      description: 'This payment is waiting for network confirmation.',
      destination: 'activity',
    };
  }
  if (operations.some(item => item.kind === 'deposit' && ['prepared', 'checking', 'pending', 'broadcast'].includes(item.state))) {
    return {
      title: 'Bitcoin deposit is being checked',
      description: 'These Bitcoin are not available to send yet. Open deposit details.',
      destination: 'deposits',
    };
  }
  return null;
}
