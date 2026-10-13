import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { walletSession } from '../lib/wallet-session';
import { emptySignup, SignupError, signupErrorMessage, validateSignup, type SignupFields, type SignupResult } from '../lib/opago/signup';
import { submitPrivateSignup } from '../lib/opago/signup-native';
import { languagePreference } from '../lib/i18n/language';
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SignupResult | null>(null);
  const [problem, setProblem] = useState<SignupError | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  // A synchronous fence blocks even a second tap before React renders busy=true.
  const flight = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const context = useRef({ focused, foreground, isLocked, hederaPublicKey, sparkWallet });
  context.current = { focused, foreground, isLocked, hederaPublicKey, sparkWallet };
  const invalidate = useCallback(() => { generation.current++; flight.current?.abort(); flight.current = null; }, []);
  const clear = useCallback(() => {
    invalidate(); setFields(emptySignup()); setErrors({}); setBusy(false); setResult(null); setProblem(null);
  }, [invalidate]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      context.current.foreground = state === 'active';
      setForeground(state === 'active'); if (state !== 'active') clear();
    });
    const unsubscribe = walletSession.subscribe(clear);
    return () => { invalidate(); subscription.remove(); unsubscribe(); };
  }, [clear, invalidate]);
  useEffect(clear, [clear, focused, isLocked, hederaPublicKey, sparkWallet]);
  useEffect(() => {
    if (!retryUntil) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= retryUntil) setRetryUntil(0); }, 1000);
    return () => clearInterval(timer);
  }, [retryUntil]);
  const visible = focused && foreground && !isLocked;
  const recovery = !!problem && ['unknown', 'unavailable', 'rateLimited'].includes(problem.problem);
  const submit = async () => {
    const start = context.current;
    if (flight.current || result || problem?.problem === 'closed' || problem?.problem === 'conflict' ||
        !start.focused || !start.foreground || start.isLocked || Date.now() < retryUntil) return;
    const invalid = validateSignup(fields); setErrors(invalid);
    if (Object.keys(invalid).length) return;
    let assertSession: () => void;
    try { assertSession = walletSession.capture(); } catch { clear(); return; }
    const controller = new AbortController(); flight.current = controller;
    const version = generation.current;
    const current = () => {
      const next = context.current;
      if (version !== generation.current || flight.current !== controller || controller.signal.aborted || !next.focused ||
          !next.foreground || next.isLocked || start.hederaPublicKey !== next.hederaPublicKey || start.sparkWallet !== next.sparkWallet) return false;
      try { assertSession(); return true; } catch { return false; }
    };
    setBusy(true); setProblem(null);
    const submitted = { ...fields };
    // The password exists only in this single in-flight request, never in an outbox.
    setFields(value => ({ ...value, password: '' }));
    try {
      const response = await submitPrivateSignup(submitted, languagePreference.getSnapshot().language, controller.signal);
      if (current()) { setResult(response); setFields(emptySignup()); }
    } catch (cause) {
      if (current()) {
        const error = cause instanceof SignupError ? cause : new SignupError('unknown');
        setProblem(error);
        setRetryUntil(error.retryAfterSeconds ? Date.now() + error.retryAfterSeconds * 1000 : 0);
        setNow(Date.now());
      }
    } finally {
      submitted.password = '';
      if (current()) { flight.current = null; setBusy(false); }
    }
  };
  const leave = (path: '/opago-account' | '/(tabs)') => { clear(); context.current.focused = false; router.replace(path); };
  const input = (key: keyof SignupFields, label: string) => <>
    <Copy>{t(label)}</Copy>
    <TextInput value={fields[key]} editable={!busy && (!recovery || key === 'password')}
      onChangeText={value => { if (!flight.current) { setFields(current => ({ ...current, [key]: value })); setErrors({}); } }}
      onBlur={() => { if (!flight.current) setErrors(validateSignup(fields)); }} accessibilityLabel={t(label)}
      autoCapitalize="none" autoCorrect={false} secureTextEntry={key === 'password'}
      autoComplete={key === 'password' ? 'new-password' : key === 'email' ? 'email' : 'tel'}
      keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
      style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
    {errors[key] && <Copy warning>{t(errors[key]!)}</Copy>}
  </>;
  return <OpagoPage title="Create an OPAGO account" busy={busy} error="" testOnly={false}>
    <Copy>{t('Your OPAGO account is a private customer account. Registration uses your email, mobile number and password. No identity photos are required.')}</Copy>
    {visible && <>
      {problem && <Copy warning>{t(signupErrorMessage(problem))}</Copy>}
      {result ? <Card title="Registration complete">
        <Copy>{t(result.status === 'created' ? 'Your private account has been created and is active.' : 'Your registration has been resumed and your account is active.')}</Copy>
        <Copy>{t(result.email_verification === 'pending' ? 'Email confirmation is pending. Follow the link in your email. You can sign in now.' :
          result.email_verification === 'confirmed' ? 'Your email address is confirmed. You can sign in now.' : 'Email confirmation is not required for this account. You can sign in now.')}</Copy>
        <Copy>{t('Registration does not sign you in, link your wallet or verify your identity.')}</Copy>
        <Action label="Sign in to OPAGO" onPress={() => leave('/opago-account')} />
      </Card> : <Card title="Account details">
        {input('email', 'Email address')}{input('phone', 'Mobile number')}{input('password', 'Password')}
        <Copy>{t('Use + and the country code for your mobile number. Entering it does not verify it. No SMS confirmation is required in this release; email confirmation will use an email link.')}</Copy>
        {recovery && <Copy warning>{t('Try signing in first. To continue registration, enter the same password and use the same email and phone as before. This does not reset your password.')}</Copy>}
        {retryUntil > now && <Copy>{t('Please wait before trying again.')}</Copy>}
        <Action label={recovery ? 'Continue registration with the same details' : 'Create private account'}
          disabled={busy || retryUntil > now || problem?.problem === 'closed' || problem?.problem === 'conflict'} onPress={() => void submit()} />
      </Card>}
    </>}
    <Copy>{t('If an earlier registration was interrupted, try signing in or continue with exactly the same email, phone and password. Registration is never retried automatically.')}</Copy>
    <Action label="Already have an account? Sign in" onPress={() => leave('/opago-account')} />
    <Action label="Continue using my wallet" onPress={() => leave('/(tabs)')} />
    <Copy>{t('Your wallet, balances, recovery words and existing account links remain unchanged. An OPAGO account is optional for your local wallet.')}</Copy>
    <LegalLinks variant="footer" />
  </OpagoPage>;
}
