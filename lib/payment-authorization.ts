import { authorizeWalletAction } from './device-authentication';
import { walletSession } from './wallet-session';

export async function authorizePayment(): Promise<() => void> {
  const assertAuthorized = await authorizeWalletAction('Confirm this payment');
  assertAuthorized();
  walletSession.touch();
  return assertAuthorized;
}
