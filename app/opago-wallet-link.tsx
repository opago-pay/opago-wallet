import { useIsFocused } from '@react-navigation/native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useRouter } from 'expo-router';
import { useOpagoAccount } from '../hooks/useOpagoAccount';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { Action, Card, Copy, OpagoPage } from '../components/opago/opago-ui';
import { UpdateAccountApp } from '../components/opago/update-account-app';
import { t } from '../lib/i18n';

/** Explicit native account/ownership/binding operations; no test-mode route input. */
export default function WalletLinkScreen() {
  usePreventScreenCapture('opago-wallet-link');
  const focused = useIsFocused();
  const { isLocked } = useWalletAuth();
  const router = useRouter();
  const { runtime, busy, error, run, updateRequired } = useOpagoAccount(false);
  const account = runtime?.account;
  const state = account?.state;
  const visible = focused && !isLocked;
  const linked = !!(account?.walletStateCurrent() && state?.wallet?.status === 'active' &&
    state.wallet.party_id && state.wallet.party_id === state.account?.party_id && state.session?.scope === 'wallet');
  return <OpagoPage title="Wallet ownership and binding" busy={busy} error={visible ? error : ''} testOnly={false}>
    {updateRequired && <UpdateAccountApp />}
    {visible && <>
      <Copy>{t('Your local BTC, Lightning and HBAR wallet works without an OPAGO account. Its 12 recovery words remain your wallet backup.')}</Copy>
      {account && state && !state.deletion && <>
        <Card title="Account sign-in">
          <Copy>{t(state.account ? 'Account verified by OPAGO. Prove ownership and link this wallet to continue.' : 'Sign in to your existing account in the OPAGO browser window.')}</Copy>
          <Action label="Refresh account details" disabled={busy} onPress={() => void run(async () => { await account.resumeAccount(); })} />
          <Action label={state.credential ? 'Sign in again' : 'Sign in to OPAGO'} disabled={busy} onPress={() => void run(() => account.signIn(true))} />
          {state.account && !state.account.email_verified && <Copy>{t('You are signed in. Confirm your email before linking this wallet, then refresh your account details.')}</Copy>}
          {(state.credential || state.session || state.logoutPending) && <Action label="Sign out of OPAGO" disabled={busy} onPress={() => void run(() => account.signOut())} />}
        </Card>
        <Card title="Wallet ownership and binding">
          <Copy>{t(linked ? 'This wallet is explicitly linked to your OPAGO account.' : state.session
            ? 'Wallet binding has not been confirmed. Refresh the status or link this wallet.' : 'Prove ownership of this local wallet to OPAGO.')}</Copy>
          {!account.walletAvailable && <Copy>{t('Connect Lightning to prove or restore wallet ownership. Account sign-in and deletion remain available.')}</Copy>}
          <Action label="Prove wallet ownership" disabled={busy || !account.walletAvailable || !state.account}
            onPress={() => void run(async () => { await account.refreshAccount(); await account.proveOwnership(); })} />
          {!linked && <Action label="Link this wallet to my OPAGO account"
            disabled={busy || !account.walletAvailable || !state.session || !state.account?.email_verified || !state.credential}
            onPress={() => void run(async () => { await account.refreshAccount(); await account.bind(); })} />}
          {state.session && <Action label="Refresh account status" disabled={busy}
            onPress={() => void run(async () => { await account.refreshAccount(); await account.refresh(); })} />}
        </Card>
      </>}
      <Action label="OPAGO account" disabled={busy} onPress={() => router.replace('/opago-account')} />
    </>}
  </OpagoPage>;
}
