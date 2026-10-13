import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import { walletSession } from '../../lib/wallet-session';
import { nativePublicAccount } from '../../lib/opago/public-account-native';
import { PublicAccountError, publicAccountErrorMessage, type PublicAccountSession } from '../../lib/opago/public-account';
import { languagePreference } from '../../lib/i18n/language';
import { t } from '../../lib/i18n';
import { themeColor } from '../../lib/theme-styles';
import { Action, Card, Copy, OpagoPage, TextInput, ui } from './opago-ui';

export function PublicAccountScreen() {
  usePreventScreenCapture('opago-public-account');
  const focused = useIsFocused(), router = useRouter();
  const { sparkWallet, hederaPublicKey, isLocked } = useWalletAuth();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [retryUntil, setRetryUntil] = useState(0), [clock, setClock] = useState(Date.now);
  const [verified, setVerified] = useState<{ value: PublicAccountSession; sparkWallet: typeof sparkWallet; hederaPublicKey: typeof hederaPublicKey } | null>(null);
  const flight = useRef<AbortController | null>(null), generation = useRef(0);
  const context = useRef({ focused, foreground, isLocked, sparkWallet, hederaPublicKey });
  context.current = { focused, foreground, isLocked, sparkWallet, hederaPublicKey };
  const visible = focused && foreground && !isLocked;
  const session = visible && verified?.sparkWallet === sparkWallet && verified?.hederaPublicKey === hederaPublicKey ? verified.value : null;
  const cancelFlight = useCallback(() => {
    generation.current++; flight.current?.abort(); flight.current = null;
  }, []);
  const clear = useCallback(() => {
    cancelFlight();
    setEmail(''); setPassword(''); setVerified(null); setBusy(false); setError(''); setNotice('');
  }, [cancelFlight]);
  const execute = useCallback(async (kind: 'resume' | 'login' | 'logout' | 'reset', credentials?: { email: string; password: string }, previous?: PublicAccountSession | null) => {
    const start = context.current;
    if (flight.current || !start.focused || !start.foreground || start.isLocked) return;
    let assertUnlocked: () => void;
    try { assertUnlocked = walletSession.capture(); } catch { clear(); return; }
    const controller = new AbortController(); flight.current = controller;
    const epoch = generation.current;
    const check = () => {
      const next = context.current;
      if (epoch !== generation.current || flight.current !== controller || controller.signal.aborted || !next.focused || !next.foreground || next.isLocked ||
          start.sparkWallet !== next.sparkWallet || start.hederaPublicKey !== next.hederaPublicKey) throw new PublicAccountError('cancelled');
      assertUnlocked();
    };
    setBusy(true); setError(''); setNotice(''); setPassword(''); setVerified(null);
    try {
      const service = nativePublicAccount();
      let result: PublicAccountSession | null = null;
      if (kind === 'login') result = await service.login(credentials!.email, credentials!.password, controller.signal, check);
      else if (kind === 'logout') await service.logout(previous || null, controller.signal);
      else if (kind === 'reset') {
        await service.client.requestPasswordReset(credentials!.email, languagePreference.getSnapshot().language, controller.signal);
        check(); setNotice('If this account can receive a password reset, an email will be sent.');
      } else result = await service.resume(controller.signal, check);
      check();
      setVerified(result ? { value: result, sparkWallet: start.sparkWallet, hederaPublicKey: start.hederaPublicKey } : null);
    } catch (cause) {
      try {
        check(); setError(publicAccountErrorMessage(cause));
        if (cause instanceof PublicAccountError && cause.retryAfterSeconds) setRetryUntil(Date.now() + cause.retryAfterSeconds * 1000);
      } catch { /* An old response never changes a newer screen or wallet. */ }
    } finally {
      if (credentials) credentials.password = '';
      try { check(); flight.current = null; setBusy(false); } catch { /* Lifecycle already cleared. */ }
    }
  }, [clear]);
  useEffect(() => {
    const event = AppState.addEventListener('change', state => {
      context.current.foreground = state === 'active'; setForeground(state === 'active'); if (state !== 'active') clear();
    });
    const unsubscribe = walletSession.subscribe(clear);
    return () => { cancelFlight(); event.remove(); unsubscribe(); };
  }, [cancelFlight, clear]);
  useEffect(() => {
    clear(); if (focused && foreground && !isLocked) void execute('resume');
    return cancelFlight;
  }, [cancelFlight, clear, execute, focused, foreground, isLocked, sparkWallet, hederaPublicKey]);
  useEffect(() => {
    if (!session && !retryUntil) return;
    const timer = setInterval(() => {
      const now = Date.now(); setClock(now);
      if (retryUntil && now >= retryUntil) setRetryUntil(0);
      if (session && now >= session.expiresAt) { setVerified(null); setError(publicAccountErrorMessage(new PublicAccountError('expired'))); }
    }, 1000);
    return () => clearInterval(timer);
  }, [session, retryUntil]);
  const submit = (reset = false) => {
    if (Date.now() < retryUntil) return;
    void execute(reset ? 'reset' : 'login', { email, password: reset ? '' : password });
  };
  return <OpagoPage title="OPAGO account" busy={busy} error={error} testOnly={false}>
    <Copy>{t('Your local BTC, Lightning and HBAR wallet works without an OPAGO account. Its 12 recovery words remain your wallet backup.')}</Copy>
    {visible && <>
      {notice && <Copy>{t(notice)}</Copy>}
      {session ? <Card title="Account sign-in">
        <Copy>{t('Signed in to OPAGO. Wallet ownership is proved separately.')}</Copy>
        {session.identity.email && <Copy>{session.identity.email}</Copy>}
        <Action label="Refresh account details" disabled={busy} onPress={() => void execute('resume')} />
        <Action label="Sign out of OPAGO" disabled={busy} onPress={() => void execute('logout', undefined, session)} />
      </Card> : <Card title="Account sign-in">
        <Copy>{t('Sign in securely with your OPAGO email address and password.')}</Copy>
        <TextInput value={email} onChangeText={setEmail} editable={!busy} accessibilityLabel={t('Email address')} placeholder={t('Email address')}
          autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={320}
          style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
        <TextInput value={password} onChangeText={setPassword} editable={!busy} accessibilityLabel={t('Password')} placeholder={t('Password')}
          autoComplete="current-password" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={4096}
          style={[ui.input, { color: themeColor('text'), borderColor: themeColor('border') }]} />
        {retryUntil > clock && <Copy>{t('Please wait before trying again.')}</Copy>}
        <Action label="Sign in to OPAGO" disabled={busy || !email.trim() || !password || retryUntil > clock} onPress={() => submit()} />
        <Action label="Reset password" disabled={busy || !email.trim() || retryUntil > clock} onPress={() => submit(true)} />
        <Action label="Create an OPAGO account" disabled={busy} onPress={() => { clear(); context.current.focused = false; router.push('/opago-signup'); }} />
        <Action label="Refresh account details" disabled={busy || retryUntil > clock} onPress={() => void execute('resume')} />
      </Card>}
      <Copy>{t('Wallet linking and personal Lightning addresses are not available yet. Your local wallet remains available.')}</Copy>
    </>}
  </OpagoPage>;
}
