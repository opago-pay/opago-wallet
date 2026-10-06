import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from '../components/opago/opago-ui';
import { useOpagoAccount } from '../hooks/useOpagoAccount';
import { themeColor } from '../lib/theme-styles';
import { appConfig } from '../lib/config';
import { t } from '../lib/i18n';
const identityLabels: Record<string, string> = { given_name: 'Given name', family_name: 'Family name', date_of_birth: 'Date of birth',
  nationality: 'Nationality', document_number: 'Document number', document_expiry: 'Document expiry date', contact_email: 'Contact email' };
export default function UmaSendScreen() {
  const params = useLocalSearchParams<{ test?: string; receiver?: string }>(); const router = useRouter();
  const testOnly = __DEV__ && params.test === '1'; const { runtime, busy, error, run } = useOpagoAccount(testOnly);
  const [receiver, setReceiver] = useState(params.receiver || (testOnly ? '$alice@receiver.example' : ''));
  const [amount, setAmount] = useState(''); const payment = runtime?.uma.payment;
  const canStart = !payment || payment.phase === 'cancelled' || payment.phase === 'confirmed';
  return <OpagoPage title="Send with UMA" busy={busy} error={error} testOnly={testOnly}>
    <Copy>{t('UMA shares required identity data with the listed providers. Review the data before consenting, then confirm the payment separately.')}</Copy>
    {!runtime && <Action label="Open OPAGO account" onPress={() => router.push('/opago-account')} />}
    {runtime && canStart && <Card title="Recipient and amount">
      <TextInput value={receiver} onChangeText={setReceiver} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={320}
        accessibilityLabel={t('UMA recipient')} placeholder="$name@provider.com" placeholderTextColor={themeColor('muted')}
        style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
      <TextInput value={amount} onChangeText={setAmount} editable={!busy} keyboardType="number-pad" maxLength={15}
        accessibilityLabel={t('Amount in SAT')} placeholder={t('Amount in SAT')} placeholderTextColor={themeColor('muted')}
        style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
      <Action label="Review identity disclosure" disabled={busy || !/^[1-9]\d*$/.test(amount)}
        onPress={() => void run(() => runtime.uma.reviewDisclosure(receiver, Number(amount), appConfig.maxLightningFeeSats))} />
    </Card>}
    {payment && !['cancelled', 'confirmed'].includes(payment.phase) && <Card title="Required data disclosure">
      <Copy>{t('Recipient: {receiver}', { receiver: payment.disclosure.receiver })}</Copy>
      <Copy>{t('Amount: {amount} SAT', { amount: payment.disclosure.amountMsat / 1000 })}</Copy>
      <Copy>{t('Maximum fee: {fee} SAT. The exact payment review follows after the invoice is verified.', { fee: payment.disclosure.maxFeeSats })}</Copy>
      {payment.disclosure.providers.map(provider => <Copy key={provider.domain}>{provider.name} ({provider.domain}): {provider.fields.map(f => t(identityLabels[f] || f)).join(', ')}</Copy>)}
      <Copy warning>{t('Photo match only. UMA assurance remains NOT_VERIFIED.')}</Copy>
      {['consent', 'preparing'].includes(payment.phase) && <Action label="I consent to this data transfer" disabled={busy} onPress={() => void run(() => runtime!.prepare())} />}
    </Card>}
    {payment?.phase === 'review' && <Card title="Confirm UMA payment">
      <Copy>{payment.disclosure.receiver}</Copy>
      <Copy>{t('Amount: {amount} SAT', { amount: payment.disclosure.amountMsat / 1000 })}</Copy>
      <Copy>{t('Payment fee limit: {fee} SAT', { fee: payment.feeSats! })}</Copy>
      <Copy>{t('Network: {network}', { network: runtime!.account.identity.network })}</Copy>
      <Action label={testOnly ? 'Simulate confirmed payment' : 'Confirm and pay'} disabled={busy} onPress={() => void run(() => runtime!.confirm())} />
    </Card>}
    {payment && ['pending', 'submitting'].includes(payment.phase) && <Card title="Payment status pending">
      <Copy warning>{t('Do not send this payment again. An unknown outcome is not a failed payment.')}</Copy>
      <Action label="Check payment status" disabled={busy} onPress={() => void run(() => runtime!.reconcile())} />
    </Card>}
    {payment?.phase === 'confirmed' && <Card title={testOnly ? 'Simulated payment complete' : 'Payment confirmed'}>
      <Copy>{testOnly ? t('No funds were transferred.') : payment.result}</Copy>
    </Card>}
    {payment && !['pending', 'submitting', 'confirmed', 'cancelled'].includes(payment.phase) && <Action label="Cancel UMA payment" disabled={busy} onPress={() => void run(() => runtime!.uma.cancel())} />}
    <Copy>{t('A failed or unsupported UMA exchange stays in UMA. A different payment route requires a new explicit choice.')}</Copy>
  </OpagoPage>;
}
