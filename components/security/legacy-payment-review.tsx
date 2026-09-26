import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { adaptColor } from '@/lib/theme-styles';
import { t } from '@/lib/i18n';
import { reviewLegacyPayments, type LegacyPaymentIssue } from '@/lib/legacy-payment-review';
import { walletSession } from '@/lib/wallet-session';
import { OPAGO_LINKS } from '@/lib/legal-links';

export function LegacyPaymentReview() {
  const [issues, setIssues] = useState<LegacyPaymentIssue[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const assertCurrent = walletSession.capture();
      const result = await reviewLegacyPayments(AsyncStorage);
      assertCurrent();
      setIssues(result);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (issues?.length === 0 && !failed) return null;
  return <View style={{ padding: 18, borderRadius: 18, borderWidth: 1,
    borderColor: adaptColor('#66501d', 'borderColor'), backgroundColor: adaptColor('#211b0f', 'backgroundColor'), marginTop: 18 }}>
    <Text style={{ color: adaptColor('#f4d38a', 'color'), fontWeight: '700', fontSize: 17 }}>{t('Older payments need review')}</Text>
    {issues === null && !failed && <ActivityIndicator color={adaptColor('#ffb000', 'color')} />}
    {(issues || []).map(issue => <Text key={issue.network} style={{ color: adaptColor('#e6ddc8', 'color'), lineHeight: 21, marginTop: 8 }}>
      {issue.network}: {issue.invalid ? t('Stored payment details could not be read.') :
        t('{count} unresolved older payments', { count: issue.pending })}
      {issue.references.length ? ` · ${issue.references.join(', ')}` : ''}
    </Text>)}
    {failed && <Text style={{ color: adaptColor('#e6ddc8', 'color'), marginTop: 8 }}>{t('Stored payment details could not be read.')}</Text>}
    <Text style={{ color: adaptColor('#e6ddc8', 'color'), lineHeight: 21, marginTop: 10 }}>
      {t('These older records do not identify their wallet or network. Do not send the payment again. Contact Opago support with the reference and your payment receipt; never share recovery words. Support must verify the original wallet, network and final payment result before the block can be resolved.')}
    </Text>
    <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(OPAGO_LINKS.contact)
      .catch(() => Alert.alert(t('Could not open this page'), t('Please try again.')))}
      style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: adaptColor('#ffca54', 'color'), fontWeight: '700' }}>{t('Contact support')}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: adaptColor('#ffca54', 'color'), fontWeight: '700' }}>{t('Check again')}</Text>
    </TouchableOpacity>
  </View>;
}
