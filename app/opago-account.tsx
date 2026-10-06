import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOpagoAccount } from '../hooks/useOpagoAccount';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from '../components/opago/opago-ui';
import { activeLightningAddress } from '../lib/opago/address';
import { photoMatchReady } from '../lib/opago/account';
import { themeColor } from '../lib/theme-styles';
import { t } from '../lib/i18n';
import QRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';
import { UpdateAccountApp } from '../components/opago/update-account-app';

const kyaText = { draft: 'Identity details are still a draft.', submitted: 'Identity details submitted.', in_review: 'The photo and data comparison is in progress.',
  approved: 'Photo and data comparison passed. This is not a fully verified identity. UMA status: NOT_VERIFIED.',
  correction_requested: 'Please correct the requested fields in identity onboarding and submit a new revision.',
  rejected: 'The photo and data comparison was rejected. Contact support.' };
export default function OpagoAccountScreen() {
  const params = useLocalSearchParams<{ test?: string }>();
  const [testOnly, setTestOnly] = useState(__DEV__ && params.test === '1');
  const { runtime, busy, error, run, updateRequired } = useOpagoAccount(testOnly);
  const router = useRouter(); const [name, setName] = useState(''); const [deleteText, setDeleteText] = useState('');
  const [closing, setClosing] = useState(false);
  const account = runtime?.account; const state = account?.state; const wallet = state?.wallet;
  const active = account ? activeLightningAddress(account, runtime!.publicAddressOrigin) : null;
  useEffect(() => {
    if (!runtime?.account.state.session || busy) return;
    const timer = setInterval(() => { void run(() => runtime.account.refresh()); }, 30_000);
    return () => clearInterval(timer);
  }, [runtime, busy, run]);
  return <OpagoPage title="OPAGO account" busy={busy} error={error} testOnly={testOnly}>
    {updateRequired && <UpdateAccountApp />}
    <Copy>{t('Your local BTC, Lightning and HBAR wallet works without an OPAGO account. Its 12 recovery words remain your wallet backup.')}</Copy>
    <Action label="POS wallet links" disabled={busy} onPress={() => router.push({ pathname: '/pos-link', params: testOnly ? { test: '1' } : {} })} />
    <Action label="Transaction synchronization" disabled={busy} onPress={() => router.push({ pathname: '/transaction-sync', params: testOnly ? { test: '1' } : {} })} />
    {!runtime && <Card title="Account services unavailable"><Copy>{t('OPAGO account services are not available in this build. Your local wallet remains available.')}</Copy></Card>}
    {__DEV__ && <Action label={testOnly ? 'Leave contract test mode' : 'Start contract test mode'} disabled={busy} onPress={() => setTestOnly(!testOnly)} />}
    {runtime && account && state && !state.deletion && <>
      <Card title="Account sign-in">
        <Copy>{t(state.credential ? 'Signed in to OPAGO. Wallet ownership is proved separately.' : 'Sign in or create an account in the OPAGO browser window.')}</Copy>
        <Action label={state.credential ? 'Sign in again' : 'Sign in or register'} disabled={busy} onPress={() => void run(() => account.signIn())} />
        {state.credential && <Action label="Sign out of OPAGO" disabled={busy} onPress={() => void run(() => account.signOut())} />}
      </Card>
      <Card title="Wallet ownership and binding">
        <Copy>{t(wallet?.party_id ? 'This wallet is explicitly linked to your OPAGO account.' : state.session ? 'Wallet ownership proved. The wallet is not linked to an account yet.' : 'Prove ownership of this local wallet to OPAGO.')}</Copy>
        {!account.walletAvailable && <Copy>{t('Connect Lightning to prove or restore wallet ownership. Account sign-in and deletion remain available.')}</Copy>}
        <Action label="Prove wallet ownership" disabled={busy || !account.walletAvailable} onPress={() => void run(() => account.proveOwnership())} />
        {!wallet?.party_id && <Action label="Link this wallet to my OPAGO account" disabled={busy || !state.credential || !state.session} onPress={() => void run(() => account.bind())} />}
        {state.credential && <><Copy>{t('After restoring your 12 words, restore the OPAGO link with the owning account. Address reactivation is a separate step.')}</Copy>
          <Action label="Restore my OPAGO wallet link" disabled={busy || !account.walletAvailable} onPress={() => void run(() => account.restore())} /></>}
        {state.session && <Action label="Refresh account status" disabled={busy} onPress={() => void run(() => account.refresh())} />}
      </Card>
      <Card title="Identity status">
        <Copy>{t(wallet?.photo_match ? kyaText[wallet.photo_match.status] : 'Identity onboarding has not been submitted.')}</Copy>
        {wallet?.photo_match?.active_approval_revision && wallet.photo_match.status !== 'approved' ?
          <Copy>{t('Your previous approved revision remains active. This does not indicate a fully verified identity.')}</Copy> : null}
        {!!wallet?.photo_match?.correction_fields.length && <Copy>{wallet.photo_match.correction_fields.join(', ')}</Copy>}
        <Copy>{t('Identity data and photo capture are provided by identity onboarding. The backend decides the comparison status.')}</Copy>
        {runtime.setTestKya && <>
          <Action label="Test: comparison in progress" disabled={busy} onPress={() => void run(() => runtime.setTestKya!('in_review'))} />
          <Action label="Test: comparison passed" disabled={busy} onPress={() => void run(() => runtime.setTestKya!('approved'))} />
          <Action label="Test: correction requested" disabled={busy} onPress={() => void run(() => runtime.setTestKya!('correction_requested'))} />
          <Action label="Test: comparison rejected" disabled={busy} onPress={() => void run(() => runtime.setTestKya!('rejected'))} />
        </>}
      </Card>
      <Card title="Personal Lightning address">
        {account.hasPendingAddressOperation && <Action label="Recover unfinished address operation" disabled={busy}
          onPress={() => void run(() => account.resumeAddress())} />}
        {active ? <>
          <Copy>{testOnly ? t('Synthetic test address — do not send funds.') : active.address}</Copy>
          {!testOnly && <View style={{ alignSelf: 'center', padding: 14, backgroundColor: '#fff' }} accessibilityLabel={active.address}>
            <QRCode value={active.qr_payload} size={210} color="#000" backgroundColor="#fff" />
          </View>}
        </> : <Copy>{t(wallet?.address?.status === 'deactivated' ? 'Your address is deactivated.' : 'Your address is not active. It becomes usable only after the backend confirms activation.')}</Copy>}
        <TextInput value={name} onChangeText={setName} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={32}
          accessibilityLabel={t('Lightning address name')} placeholder={t('Lightning address name')}
          placeholderTextColor={themeColor('muted')} style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
        <Action label={wallet?.address ? 'Change address name' : 'Activate my Lightning address'} disabled={busy || !photoMatchReady(wallet || null) || !name}
          onPress={() => void run(() => account.address(wallet?.address ? 'rename' : 'set', name))} />
        {wallet?.address && <Action label={wallet.address.status === 'active' ? 'Deactivate my address' : 'Reactivate my address'} disabled={busy}
          onPress={() => void run(() => account.address(wallet.address!.status === 'active' ? 'deactivate' : 'reactivate'))} />}
        <Action label="Send with UMA" disabled={busy || !active} onPress={() => router.push({ pathname: '/uma-send', params: testOnly ? { test: '1' } : {} })} />
      </Card>
      {state.credential && <Card title="OPAGO service management">
        <Copy>{t('Closing the OPAGO wallet link deactivates its address. It can be restored with the owning account and wallet proof. Your local funds and keys stay on this device.')}</Copy>
        {!closing ? <Action label="Close OPAGO wallet link" disabled={busy || !state.session} onPress={() => setClosing(true)} /> :
          <><Action label="Confirm closing OPAGO wallet link" destructive disabled={busy} onPress={() => void run(async () => { await account.close(); setClosing(false); })} />
            <Action label="Cancel" disabled={busy} onPress={() => setClosing(false)} /></>}
        <Copy warning>{t('Deleting your OPAGO account revokes sessions and disables its addresses. Retained records follow the backend retention policy. This does not delete your local wallet or erase all retained data. Type DELETE to confirm.')}</Copy>
        <TextInput value={deleteText} onChangeText={setDeleteText} editable={!busy} accessibilityLabel={t('Type DELETE to confirm account deletion')}
          autoCorrect={false} autoCapitalize="characters" style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
        <Action label="Delete OPAGO account" destructive disabled={busy || deleteText !== 'DELETE'} onPress={() => void run(() => account.deleteAccount())} />
      </Card>}
    </>}
    {state?.deletion && account && <Card title="Account deletion receipt">
      <Copy>{t(state.deletionStatus?.status === 'deleted' ? 'OPAGO account deleted. Retained records may remain under the approved retention policy.' : 'Account deletion is pending. OPAGO access is revoked.')}</Copy>
      <Action label="Check deletion status" disabled={busy} onPress={() => void run(() => account.deletionStatus())} />
      <Copy>{t('After deletion is complete, new onboarding starts a new service relationship. Old approval and address names are not restored.')}</Copy>
      <Action label="Start new OPAGO onboarding" disabled={busy || state.deletionStatus?.status !== 'deleted'} onPress={() => void run(() => account.restartOnboarding())} />
    </Card>}
  </OpagoPage>;
}
