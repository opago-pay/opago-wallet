import { authorizeWalletAction } from './device-authentication';
import { walletSession } from './wallet-session';
import { securityPreferences } from './security-preferences';

export async function authorizePayment(): Promise<() => void> {
  if (securityPreferences.getSnapshot().ready && !securityPreferences.getSnapshot().authenticatePayments) {
    const assertAuthorized = walletSession.capture();
    assertAuthorized();
    walletSession.touch();
    return assertAuthorized;
  }
  const assertAuthorized = await authorizeWalletAction('Confirm this payment', { allowDeviceCredential: true });
  assertAuthorized();
  walletSession.touch();
  return assertAuthorized;
}
