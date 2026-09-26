import { Platform } from 'react-native';
import { authorizeWalletAction, withProtectedWalletAccess } from './device-authentication';
import { getBiometricallyProtectedMnemonic, getSecureItem, MNEMONIC_STORE_KEY } from './storage';
import { walletSession } from './wallet-session';

// A protected iOS keychain read already requires Face ID. Legacy entries and
// Android PIN-only wallets still need an explicit device authorization first.
export async function readRecoveryPhraseForDisplay(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const protectedPhrase = await withProtectedWalletAccess(getBiometricallyProtectedMnemonic);
    if (protectedPhrase) return protectedPhrase;
  }
  const assertAuthorized = await authorizeWalletAction('Unlock your Opago recovery phrase');
  assertAuthorized();
  const phrase = await withProtectedWalletAccess(() => getSecureItem(MNEMONIC_STORE_KEY));
  walletSession.capture()();
  return phrase;
}
