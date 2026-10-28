import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletAuth } from './useWalletAuth';
import { getF3Runtime, type F3Runtime } from '../lib/opago/runtime-native';
import { opagoUserError } from '../lib/opago/errors';
import { OpagoError } from '../lib/opago/api';
export function useOpagoAccount(testOnly: boolean) {
  const { sparkWallet, hederaPublicKey } = useWalletAuth();
  const [loaded, setLoaded] = useState<{ runtime: F3Runtime; sparkWallet: typeof sparkWallet; hederaPublicKey: typeof hederaPublicKey; testOnly: boolean } | null>(null);
  // Hide a previous wallet in the very first render after switching, before effects run.
  const runtime = loaded && loaded.sparkWallet === sparkWallet && loaded.hederaPublicKey === hederaPublicKey && loaded.testOnly === testOnly ? loaded.runtime : null;
  const current = useRef(runtime); current.current = runtime;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updateRequired, setUpdateRequired] = useState(false);
  const [, update] = useState(0);
  useEffect(() => {
    let active = true; setLoaded(null); setBusy(false); setError(''); setUpdateRequired(false);
    getF3Runtime(sparkWallet, hederaPublicKey, testOnly).then(value => {
      if (active) { setLoaded({ runtime: value, sparkWallet, hederaPublicKey, testOnly }); if (value.startupError) setError(opagoUserError(value.startupError)); update(v => v + 1); }
    }, cause => { if (active) {
      const update = cause instanceof OpagoError && cause.code === 'app_update_required'; setUpdateRequired(update);
      setError(opagoUserError(cause));
    } });
    return () => { active = false; current.current = null; };
  }, [sparkWallet, hederaPublicKey, testOnly]);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (!runtime || current.current !== runtime || busy) return;
    setBusy(true); setError('');
    try { await runtime.perform(action); }
    catch (cause) {
      // Only stable local messages/codes; never display raw peer/backend bodies or PII.
      if (current.current === runtime) {
        setError(opagoUserError(cause));
        setUpdateRequired(cause instanceof OpagoError && cause.code === 'app_update_required');
      }
    } finally { if (current.current === runtime) { setBusy(false); update(v => v + 1); } }
  }, [runtime, busy]);
  return { runtime, busy, error, run, updateRequired };
}
