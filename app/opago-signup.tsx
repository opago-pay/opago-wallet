import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { walletSession } from '../lib/wallet-session';
import { emptySignup, signupAvailable, validateSignup, type SignupFields } from '../lib/opago/signup';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from '../components/opago/opago-ui';
import { LegalLinks } from '../components/legal/legal-links';
import { themeColor } from '../lib/theme-styles';
import { t } from '../lib/i18n';

export default function SignupScreen() {
  usePreventScreenCapture('opago-signup');
  const router = useRouter(); const focused = useIsFocused();
  const { hederaPublicKey, sparkWallet, isLocked } = useWalletAuth();
  const [fields, setFields] = useState(emptySignup);
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFields, string>>>({});
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const clear = () => { setFields(emptySignup()); setErrors({}); };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active'); if (state !== 'active') clear();
    });
    const unsubscribe = walletSession.subscribe(clear);
    return () => { subscription.remove(); unsubscribe(); };
  }, []);
  useEffect(clear, [focused, isLocked, hederaPublicKey, sparkWallet]);
  const visible = focused && foreground && !isLocked;
  const input = (key: keyof SignupFields, label: string) => <>
    <Copy>{t(label)}</Copy>
    <TextInput value={fields[key]} onChangeText={value => { setFields(current => ({ ...current, [key]: value })); setErrors({}); }}
      onBlur={() => setErrors(validateSignup(fields))} accessibilityLabel={t(label)}
      autoCapitalize="none" autoCorrect={false} secureTextEntry={key === 'password'}
      autoComplete={key === 'password' ? 'new-password' : key === 'email' ? 'email' : 'tel'}
      keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
      style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
    {errors[key] && <Copy warning>{t(errors[key]!)}</Copy>}
  </>;
  return <OpagoPage title="Create an OPAGO account" busy={false} error="" testOnly={false}>
    <Copy>{t('Your OPAGO account is a private customer account. Registration uses your email, mobile number and password. No identity photos are required.')}</Copy>
    <Copy warning>{t('Registration is not available yet. This form does not send or save your details and cannot create an account.')}</Copy>
    {visible && <Card title="Account details">
      {input('email', 'Email address')}{input('phone', 'Mobile number')}{input('password', 'Password')}
      <Copy>{t('Entering a mobile number does not verify it. The required number format and any contact confirmation will be shown when registration becomes available.')}</Copy>
      <Action label="Create private account" disabled={!signupAvailable} onPress={() => { clear(); }} />
    </Card>}
    <Copy>{t('If you already submitted a registration and its result is unknown, do not submit it again. Try signing in or contact support.')}</Copy>
    <Action label="Already have an account? Sign in" onPress={() => { clear(); router.replace('/opago-account'); }} />
    <Action label="Continue using my wallet" onPress={() => { clear(); router.replace('/(tabs)'); }} />
    <Copy>{t('Your wallet, balances, recovery words and existing account links remain unchanged. An OPAGO account is optional for your local wallet.')}</Copy>
    <LegalLinks variant="footer" />
  </OpagoPage>;
}
