import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useOpagoAccount } from '../hooks/useOpagoAccount';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from '../components/opago/opago-ui';
import { PaymentScanner } from '../components/send/payment-scanner';
import { paymentScanInbox } from '../lib/payment-scan';
import { themeColor } from '../lib/theme-styles';
import { UpdateAccountApp } from '../components/opago/update-account-app';
import { t } from '../lib/i18n';

const phases = {
  review: 'Review the operator’s request. Nothing has been approved yet.',
  confirming: 'Your approval is being checked. The link is not complete.',
  unknown: 'The response was lost or could not be verified. Recover this request before starting another.',
  awaiting_operator: 'Wallet approval received. Waiting for the operator’s separate confirmation. The link is not complete.',
  linked: 'Both sides confirmed. The backend confirms this POS is linked to this wallet.',
  declined: 'Declined on this device. No wallet approval was sent. The operator’s request expires separately.',
  expired: 'This linking request expired. Ask the operator for a new QR code.',
  superseded: 'The POS recipient changed in another request. Ask the operator for a new QR code.',
  rejected: 'The backend rejected this linking request. Ask the operator for a new QR code.',
};
export default function PosLinkScreen() {
  const params = useLocalSearchParams<{ test?: string; scanResultKey?: string }>();
  const [testOnly, setTestOnly] = useState(__DEV__ && params.test === '1');
  const { runtime, busy, error, run, updateRequired } = useOpagoAccount(testOnly);
  const [input, setInput] = useState(''); const [scanning, setScanning] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [, tick] = useState(0); const consumed = useRef('');
  const focused = useIsFocused(); const router = useRouter(); const pos = runtime?.pos;
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (pos) { pos.verified = false; pos.links = null; } setActive(state === 'active'); });
    return () => sub.remove();
  }, [pos]);
  useEffect(() => { if (pos && !focused) { pos.verified = false; pos.links = null; } }, [pos, focused]);
  useEffect(() => {
    if (!pos || !focused || !active || busy) return;
    const timer = setInterval(() => tick(v => v + 1), 1000);
    const poll = setInterval(() => { if (pos.current && pos.phase !== 'declined') void run(() => pos.refresh()); }, 10_000);
    return () => { clearInterval(timer); clearInterval(poll); };
  }, [pos, focused, active, busy, run]);
  useEffect(() => {
    if (!runtime || busy || !focused || !active || !params.scanResultKey || consumed.current === params.scanResultKey) return;
    consumed.current = params.scanResultKey; const code = paymentScanInbox.take(params.scanResultKey);
    if (code) { setInput(code); void run(() => runtime.pos.scan(code)); }
  }, [runtime, busy, focused, active, params.scanResultKey, run]);
  const review = pos?.current?.review; const phase = pos?.phase;
  const canAct = !busy && focused && active;
  if (scanning && pos) return <PaymentScanner title="Link a POS" trust="You approve only the recipient wallet. The operator confirms separately."
    invalidCodeMessage="This is not a supported POS linking code. Ask the operator for a new QR code."
    onCancel={() => setScanning(false)} onDetected={() => {}}
    onOtherCode={code => { pos.decode(code); setScanning(false); setInput(code); void run(() => pos.scan(code)); return true; }} />;
  return <OpagoPage title="POS wallet links" busy={busy} error={error} testOnly={testOnly}>
    {updateRequired && <UpdateAccountApp />}
    <Copy>{t('The operator starts the link. You approve the recipient wallet; this gives you no POS management rights. Both sides must consent within five minutes.')}</Copy>
    {__DEV__ && <Action label={testOnly ? 'Leave local POS test mode' : 'Start local POS test mode'} disabled={busy}
      onPress={() => { setInput(''); setTestOnly(!testOnly); }} />}
    {(!runtime || !pos?.available) && <Card title="POS integration pending"><Copy>{t('POS linking awaits the agreed QR format and wallet-readable backend details and status. Your existing wallet remains available.')}</Copy></Card>}
    <Action label="Open OPAGO account" disabled={busy} onPress={() => router.push({ pathname: '/opago-account', params: testOnly ? { test: '1' } : {} })} />
    {testOnly && runtime?.startTestPos && <Card title="Local POS test adapter">
      <Copy warning>{t('Synthetic POS only. No real device, backend or funds are changed. The test QR format is not a production linking QR.')}</Copy>
      <Action label="Test: operator starts linking" disabled={!canAct || !runtime.account.state.session}
        onPress={() => void run(async () => { const code = await runtime.startTestPos!(); setInput(code); await runtime.pos.scan(code); })} />
    </Card>}
    {pos?.available && <Card title="Operator linking request">
      <Action label="Scan operator linking QR" disabled={!canAct || !runtime?.account.state.session} onPress={() => setScanning(true)} />
      <TextInput value={input} onChangeText={setInput} editable={canAct} maxLength={4096} autoCapitalize="none" autoCorrect={false}
        accessibilityLabel={t('POS linking code')} placeholder={t('POS linking code')}
        style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
      <Action label="Review linking code" disabled={!canAct || !input || !runtime?.account.state.session} onPress={() => void run(() => pos.scan(input))} />
    </Card>}
    {review && phase && <Card title="Linking status">
      <Copy>{t('Merchant: {name}', { name: review.merchant.name })}</Copy><Copy>{t('Merchant ID: {id}', { id: review.merchant.id })}</Copy>
      <Copy>{t('POS: {id}', { id: review.intent.pos_id })}</Copy><Copy>{t('POS address: {address}', { address: review.pos.address })}</Copy>
      <Copy>{t('Target wallet: {id}', { id: review.receiver.wallet_id })}</Copy><Copy>{t('Wallet address: {address}', { address: review.receiver.address })}</Copy>
      <Copy>{t('Network: {network}', { network: review.receiver.network })}</Copy>
      <Copy>{t('New binding version: {version}', { version: String(review.intent.binding_version) })}</Copy>
      <Copy>{t('Expires at: {time}', { time: review.intent.expires_at })}</Copy>
      {phase === 'review' && <Copy>{t('Seconds remaining: {seconds}', { seconds: String(Math.max(0, Math.ceil((Date.parse(review.intent.expires_at) - Date.now()) / 1000))) })}</Copy>}
      <Copy warning>{t(pos?.verified && runtime?.account.state.session || phase === 'declined' ? phases[phase] : 'Saved request. Refresh the backend status before relying on these details.')}</Copy>
      {phase === 'review' && <>
        <Action label="Approve this POS recipient wallet" disabled={!canAct || !pos?.canApprove} onPress={() => void run(() => pos!.approve())} />
        <Action label="Decline on this device" destructive disabled={!canAct} onPress={() => void run(() => pos!.decline())} />
      </>}
      {pos?.needsRecovery && <Action label="Recover linking response" disabled={!canAct} onPress={() => void run(() => pos.recover())} />}
      {phase !== 'declined' && <Action label="Refresh linking status" disabled={!canAct} onPress={() => void run(() => pos!.refresh())} />}
      {testOnly && runtime?.confirmTestOperator && phase === 'awaiting_operator' && <Action label="Test: operator confirms separately" disabled={!canAct}
        onPress={() => void run(async () => { await runtime.confirmTestOperator!(review.intent.binding_intent_id); await pos!.refresh(); })} />}
    </Card>}
    {pos?.available && <Card title="Existing POS links">
      <Action label="Load current POS links" disabled={!canAct || !runtime?.account.state.session} onPress={() => void run(() => pos.list())} />
      {pos.links?.length === 0 && <Copy>{t('No POS links are assigned to this wallet.')}</Copy>}
      {runtime?.account.state.session && pos.links?.map(link => <Copy key={link.pos.pos_id}>{link.merchant.name + ' · ' + link.pos.pos_id + ' · ' + t(link.pos.status) + ' · ' + link.pos.address}</Copy>)}
      <Copy>{t('To change the recipient, the operator must start a new two-sided link for the new wallet. Existing invoices keep their original recipient. Wallet-side unlinking is not defined in the current contract; contact the operator.')}</Copy>
    </Card>}
  </OpagoPage>;
}
