import { useCallback, useEffect, useState } from 'react';
import { useWalletAuth } from './useWalletAuth';
import { getF3Runtime, type F3Runtime } from '../lib/opago/runtime-native';
import { opagoUserError } from '../lib/opago/errors';
import { OpagoError } from '../lib/opago/api';
export function useOpagoAccount(testOnly: boolean) {
  const { sparkWallet, hederaPublicKey } = useWalletAuth();
  const [runtime, setRuntime] = useState<F3Runtime | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updateRequired, setUpdateRequired] = useState(false);
  const [, update] = useState(0);
  useEffect(() => {
    let active = true; setRuntime(null); setError(''); setUpdateRequired(false);
    getF3Runtime(sparkWallet, hederaPublicKey, testOnly).then(value => {
      if (active) { setRuntime(value); if (value.startupError) setError(opagoUserError(value.startupError)); update(v => v + 1); }
    }, cause => { if (active) {
      const update = cause instanceof OpagoError && cause.code === 'app_update_required'; setUpdateRequired(update);
      setError(update ? opagoUserError(cause) : 'OPAGO account services are not available in this build. Your local wallet remains available.');
    } });
    return () => { active = false; };
  }, [sparkWallet, hederaPublicKey, testOnly]);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (!runtime || busy) return;
    setBusy(true); setError('');
    try { await runtime.perform(action); }
    catch (cause) {
      // Only stable local messages/codes; never display raw peer/backend bodies or PII.
      setError(opagoUserError(cause));
      setUpdateRequired(cause instanceof OpagoError && cause.code === 'app_update_required');
    } finally { setBusy(false); update(v => v + 1); }
  }, [runtime, busy]);
  return { runtime, busy, error, run, updateRequired };
}
