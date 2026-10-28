import type { OpagoAccount } from './account';

/** Explicit read-only inspection. Never creates a challenge, signs, or binds. */
export async function inspectWalletBackend(account: OpagoAccount): Promise<string> {
  if (!await account.resumeAccount()) return 'Please sign in again.';
  if (!account.state.session) return 'Account verified by OPAGO. Prove ownership and link this wallet to continue.';
  await account.refresh();
  const { wallet, session, account: profile } = account.state;
  return account.walletStateCurrent() && wallet?.status === 'active' && session.scope === 'wallet' &&
    wallet.party_id === profile?.party_id && !!wallet.party_id
    ? 'OPAGO wallet binding returned an account-linked wallet.'
    : 'The account backend returned no confirmed wallet binding.';
}
