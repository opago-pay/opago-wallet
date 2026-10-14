import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useWalletAuth } from '../../hooks/useWalletAuth';
import { walletSession } from '../../lib/wallet-session';
import { nativeWebsiteAccount } from '../../lib/opago/website-account-native';
import { WebsiteAccountError, websiteAccountMessage, type WebsiteAccountAction } from '../../lib/opago/website-account';
import { t } from '../../lib/i18n';
import { Action, Card, Copy, OpagoPage } from './opago-ui';

export function PublicAccountScreen() {
  usePreventScreenCapture('opago-public-account');
  const focused = useIsFocused(), router = useRouter();
  const { sparkWallet, hederaPublicKey, isLocked } = useWalletAuth();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const generation = useRef(0), pending = useRef(false);
  const context = useRef({ focused, isLocked, sparkWallet, hederaPublicKey });
  context.current = { focused, isLocked, sparkWallet, hederaPublicKey };
  const clear = useCallback(() => {
    generation.current++; pending.current = false; nativeWebsiteAccount().cancel();
    setBusy(false); setExpiresAt(0); setError(''); setNotice('');
  }, []);
  const execute = useCallback(async (action: WebsiteAccountAction | 'check') => {
    const start = context.current;
    if (pending.current || !start.focused || start.isLocked || AppState.currentState !== 'active') return;
    let unlocked: () => void;
    try { walletSession.capture()(); unlocked = walletSession.captureRuntime(); } catch { return; }
    const epoch = generation.current;
    const check = () => {
      const next = context.current;
      if (epoch !== generation.current || !next.focused || next.isLocked || start.sparkWallet !== next.sparkWallet ||
        start.hederaPublicKey !== next.hederaPublicKey) throw new WebsiteAccountError('cancelled');
      unlocked();
    };
    pending.current = true; setBusy(true); setError(''); setNotice(''); setExpiresAt(0);
    try {
      const result = await nativeWebsiteAccount().run(action, check); check();
      if (result?.status === 'ready') setExpiresAt(result.expiresAt);
      else if (result?.status === 'returned') setNotice('You have returned to your wallet. Sign-in has not been completed.');
      else if (result?.status === 'cancelled') setNotice('Sign-in cancelled.');
      else setError(websiteAccountMessage());
    } catch (cause) {
      try { check(); setError(websiteAccountMessage(cause)); } catch { /* Old screen/wallet. */ }
    } finally {
      if (epoch === generation.current) { pending.current = false; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    const event = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active' && !nativeWebsiteAccount().isBrowsing()) clear();
    });
    const unsubscribe = walletSession.subscribe(clear);
    return () => { clear(); event.remove(); unsubscribe(); };
  }, [clear]);
  useEffect(() => {
    clear(); if (focused && !isLocked) void execute('check');
    return clear;
  }, [clear, execute, focused, isLocked, sparkWallet, hederaPublicKey]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => { setExpiresAt(0); setError(websiteAccountMessage()); }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const visible = focused && foreground && !isLocked;
  return <OpagoPage title="OPAGO account" busy={busy} error={visible ? error : ''} testOnly={false}>
    <Copy>{t('Your local BTC, Lightning and HBAR wallet works without an OPAGO account. Its 12 recovery words remain your wallet backup.')}</Copy>
    {visible && <>
      <Card title="Account sign-in">
        <Copy>{t('Sign in or create your account on the OPAGO website. Your browser handles your password and security checks.')}</Copy>
        {notice && <Copy>{t(notice)}</Copy>}
        <Action label="Sign in" disabled={busy || expiresAt <= Date.now()} onPress={() => void execute('login')} />
        <Action label="Create account" disabled={busy || expiresAt <= Date.now()} onPress={() => void execute('signup')} />
        <Action label="Check again" disabled={busy} onPress={() => void execute('check')} />
        {busy && <Action label="Cancel sign-in" onPress={clear} />}
      </Card>
      <Action label="Continue using my wallet" onPress={() => { clear(); context.current.focused = false; router.replace('/'); }} />
    </>}
  </OpagoPage>;
}
