// Native errors can contain descriptors or payment data. Only known, static
// application messages may reach the screen or be retained in UI state.
const safe=new Set([
  'Wallet changed.', 'Bitcoin wallet is locked.', 'Enter a positive amount.',
  'Bitcoin onchain mainnet has not been enabled for this build.',
  'Bitcoin on-chain is being prepared. Mainnet support is not available in this build.',
  'Configure the Bitcoin regtest provider for this build.',
  'Bitcoin inputs are already reserved.', 'Bitcoin balance changed. Prepare the payment again.',
  'Bitcoin payment details changed or expired. Prepare them again.',
  'The Bitcoin fee changed. Review the deposit again.',
  'The refund fee expired. Prepare it again.',
  'This Bitcoin deposit is already being processed.',
  'Bitcoin deposit is too small for the refund fee.',
  'Bitcoin deposit is too small for the current fee.',
  'Bitcoin and Lightning must use the same network.',
  'Both Bitcoin balances must be available.',
  'Bitcoin provider is unavailable.',
]);
export function isOnchainUnavailable(message: string | null | undefined): boolean {
  return message === 'Bitcoin onchain mainnet has not been enabled for this build.' ||
    message === 'Bitcoin on-chain is being prepared. Mainnet support is not available in this build.';
}
export function onchainErrorMessage(cause:unknown):string{
  const message=cause instanceof Error?cause.message:'';
  if(safe.has(message))return message;
  if(/insufficient|not enough funds/i.test(message))return 'Insufficient onchain balance. Leave enough Bitcoin for the network fee.';
  return 'Bitcoin operation could not be completed. Check the saved payment status before trying again.';
}
