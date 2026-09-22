import { t } from './i18n';

export function friendlyPaymentMessage(cause: unknown, asset = 'payment'): string {
  const message = cause instanceof Error ? cause.message : '';
  const normalized = message.toLowerCase();
  if (message === 'The EUR exchange rate is unavailable.') return t('EUR estimate unavailable');
  if (message === 'The Bitcoin fee quote expired. Review this payment again.' || message === 'The Bitcoin fee changed. Review the deposit again.') return t(message);
  if (/bitcoin.*still being checked/.test(normalized)) return t('Please do not send again. We are checking the payment automatically.');
  if (/invalid bitcoin address or network/.test(normalized)) return t('Check the Bitcoin address and network. Its checksum must be valid and its network must match this wallet.');
  if (/ambiguous bitcoin|conflicting amounts/.test(normalized)) return t('This Bitcoin request contains conflicting instructions. Ask the recipient for a new request.');
  if (/unsupported feature|no supported payment route/.test(normalized)) return t('This Bitcoin request requires a payment feature this version does not support.');
  if (/invalid bitcoin amount/.test(normalized)) return t('Enter a positive Bitcoin amount with no more than eight decimal places.');
  if (message === 'The network fee changed. Nothing was sent. Review this payment again.') return t(message);
  const hederaLimit = message.match(/^HBAR amount exceeds the configured (?:mainnet|testnet) transfer limit of ([\d.]+) HBAR\.$/);
  if (hederaLimit) return t('This version allows up to {max} HBAR per payment. Enter a smaller amount.', { max: hederaLimit[1] });
  if (/^HBAR amount (?:must use at most 8 decimal places|must be greater than zero|exceeds the supported transfer range)\.$/.test(message)) {
    return t('Enter a valid HBAR amount greater than zero, with at most 8 decimal places.');
  }
  if (/fingerprint|passcode|authentication|wallet locked|unlock your wallet|not supported in this release/.test(normalized)) return t(message);
  if (/requires (?:a positive )?amount|requires an amount|enter a positive amount/.test(normalized)) {
    return t('Enter the amount you want to send.');
  }
  if (/whole numbers?|whole-satoshi/.test(normalized)) {
    return t('Enter a whole number of satoshis, for example 20.');
  }
  const range = message.match(/^Amount must be between (\d+) and (\d+) SAT\.$/);
  if (range) return t('Enter an amount between {min} and {max} SAT.', { min: range[1], max: range[2] });
  const fee = message.match(/^The Lightning fee estimate of (\d+) SAT exceeds your maximum fee of (\d+) SAT\.$/);
  if (fee) return t('The estimated network fee is {fee} SAT. This payment allows at most {max} SAT. Nothing was sent. Try again later or use a different payment request.', { fee: fee[1], max: fee[2] });
  if (/insufficient|not enough/.test(normalized)) {
    return t('There is not enough {asset} to cover this payment and its network fee.', { asset });
  }
  if (normalized.includes('expired')) {
    return t('This payment request has expired. Ask for a new QR code.');
  }
  if (/invalid signature|invoice is invalid|invalid metadata|metadata commitment/.test(normalized)) {
    return t('This payment request could not be verified. Ask the recipient for a new request.');
  }
  if (/does not match|wrong amount|amount mismatch/.test(normalized)) {
    return t('The entered amount is different from the payment request. Check it and try again.');
  }
  if (/fee estimate/.test(normalized)) {
    return t('The Lightning network could not provide a fee estimate. Nothing was sent. Please try again in a moment.');
  }
  if (normalized.includes('no ') && normalized.includes('account')) {
    return t('Your {asset} account is not ready yet. Open Request to finish setting it up.', { asset });
  }
  if (/not ready|invalid lightning balance/.test(normalized)) {
    return t('Your Bitcoin balance is still loading. Please try again in a moment.');
  }
  if (/below one satoshi/.test(normalized)) return t('The amount must be at least 1 SAT.');
  if (/only accepts/.test(normalized)) return t('This payment request uses a different Bitcoin network. Ask for a Lightning request on the same network as your wallet.');
  if (/contract_revert|rejected/.test(normalized)) {
    return t('The payment was rejected. No successful payment was recorded.');
  }
  if (/cancelled|canceled/.test(normalized)) return t('Payment cancelled. Nothing was sent.');
  if (/unavailable|timeout|timed out|network request failed|fetch failed/.test(normalized)) {
    return t('The payment network is taking too long to respond. Please try again in a moment.');
  }
  return t('We could not prepare this payment. Check the recipient and amount, then try again.');
}
