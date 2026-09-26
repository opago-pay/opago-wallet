import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { generateMnemonic } from 'bip39';
import type { PrivateKey } from '@hiero-ledger/sdk';
import * as Crypto from 'expo-crypto';
import { initializeSparkWallet } from '../lib/spark';
import {
  deleteSecureItem,
  getBiometricallyProtectedMnemonic,
  getSecureItem,
  hasStoredMnemonic,
  MNEMONIC_STORE_KEY,
  replaceInaccessibleMnemonic,
  setSecureItem,
  WALLET_IDENTITY_KEY,
  WALLET_WIPE_PENDING_KEY,
} from '../lib/storage';
import { deriveHederaPrivateKeyFromSeed } from '../lib/wallet-keys';
import { normalizeRecoveryMnemonic } from '../lib/wallet-seed';
import { deriveAuthenticatedWalletSeed } from '../lib/wallet-seed-native';
import {
  loadHederaAccount,
  type HederaAccountSnapshot,
} from '../lib/hedera/account';
import { resolveHederaWalletAccount } from '../lib/hedera/account-binding-native';
import {
  HEDERA_NETWORK,
} from '../lib/hedera/config';
import {
  sendHederaCheckoutPayment,
  type HederaCheckoutRequest,
} from '../lib/hedera/checkout';
import {
  assertHederaPaymentBalance,
  sendHederaTransfer,
  type HederaTransferResult,
} from '../lib/hedera/payments';
import { hederaPaymentJournalFor } from '../lib/hedera/payment-journal-native';
import { retryWithBackoff } from '../lib/retry';
import { walletSession } from '../lib/wallet-session';
import { authenticateDevice, authorizeWalletAction, readProtectedKeyForUnlock, withProtectedWalletAccess } from '../lib/device-authentication';
import { authorizePayment } from '../lib/payment-authorization';
import { BACKUP_STATUS_KEY, readBackupStatus } from '../lib/wallet-backup';
import { SessionResource } from '../lib/session-resource';
import { yieldToUi } from '../lib/ui-ready';
import { withTimeout } from '../lib/promise-timeout';
import { beginWalletStartupTiming, recordWalletStartupStage } from '../lib/startup-timing';
import { measurePerformance } from '../lib/performance-trace';
import { categorizeAuthFailure, recordAuthDiagnostic } from '../lib/auth-diagnostics';

type SparkWalletInstance = Awaited<ReturnType<typeof initializeSparkWallet>>;

interface WalletContextValue {
  securityReady: boolean;
  hasStoredWallet: boolean | null;
  isLocked: boolean;
  unlockWallet(): Promise<void>;
  lockWallet(): void;
  createWallet(): Promise<void>;
  backupStatus: 'loading' | 'required' | 'reviewing' | 'deferred' | 'verified';
  beginBackup(): void;
  deferBackup(): Promise<void>;
  markBackupVerified(): Promise<void>;
  isInitializing: boolean;
  initStatus: string;
  walletReady: boolean;
  sparkWallet: SparkWalletInstance | null;
  sparkStatus: 'idle' | 'connecting' | 'ready' | 'error';
  sparkError: string | null;
  retrySparkConnection(): Promise<void>;
  hederaPublicKey: string | null;
  hederaAccount: HederaAccountSnapshot | null;
  error: string | null;
  recoveryRequired: boolean;
  loadOrGenerateWallet(): Promise<void>;
  restoreWallet(mnemonic: string): Promise<void>;
  refreshHederaAccount(): Promise<HederaAccountSnapshot | null>;
  sendHederaPayment(input: {
    recipientAccountId: string;
    amountTinybars: bigint;
    checkoutRequest?: HederaCheckoutRequest;
  }): Promise<HederaTransferResult>;
  wipeWallet(): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function WalletProviderCore({ children }: { children?: ReactNode }) {
  const [securityReady, setSecurityReady] = useState(false);
  const [hasStoredWallet, setHasStoredWallet] = useState<boolean | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [backupStatus, setBackupStatus] = useState<WalletContextValue['backupStatus']>('loading');
  const initializationRef = useRef<Promise<void> | null>(null);
  const initializationGenerationRef = useRef(0);
  const hederaPrivateKeyRef = useRef<PrivateKey | null>(null);
  const startupSeedRef = useRef<Uint8Array | null>(null);
  const hederaLookupRef = useRef<Promise<HederaAccountSnapshot | null> | null>(null);
  const sparkResource = useRef(new SessionResource<SparkWalletInstance>());
  const sparkRetryRef = useRef<Promise<void> | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [sparkWallet, setSparkWallet] = useState<SparkWalletInstance | null>(null);
  const [sparkStatus, setSparkStatus] = useState<WalletContextValue['sparkStatus']>('idle');
  const [sparkError, setSparkError] = useState<string | null>(null);
  const [hederaPublicKey, setHederaPublicKey] = useState<string | null>(null);
  const [hederaAccount, setHederaAccount] = useState<HederaAccountSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  const clearRuntimeState = useCallback(() => {
    initializationGenerationRef.current += 1;
    startupSeedRef.current?.fill(0);
    startupSeedRef.current = null;
    sparkResource.current.reset();
    setSparkWallet(null);
    setSparkStatus('idle');
    setSparkError(null);
    hederaPrivateKeyRef.current = null;
    hederaLookupRef.current = null;
    setWalletReady(false);
    setBackupStatus('loading');
    setInitStatus('');
    setHederaPublicKey(null);
    setHederaAccount(null);
    setError(null);
  }, []);

  useEffect(() => {
    const runtime = sparkResource.current;
    const unsubscribe = walletSession.subscribe(() => {
      const unlocked = walletSession.isUnlocked();
      setIsLocked(!unlocked);
      if (!unlocked) clearRuntimeState();
    });
    let active = true;
    void (async () => {
      if (await getSecureItem(WALLET_WIPE_PENDING_KEY) === 'true') {
        const { resumePendingWalletWipe } = await import('../lib/wallet-wipe-native');
        await resumePendingWalletWipe();
      }
      return hasStoredMnemonic();
    })().then(exists => {
      if (!active) return;
      setHasStoredWallet(exists);
      if (!exists && AppState.currentState === 'active') walletSession.unlock();
      setSecurityReady(true);
    }).catch(cause => {
      if (!active) return;
      recordAuthDiagnostic('startup.provider_failed', categorizeAuthFailure(cause));
      setError('Secure storage could not be checked. Unlock to try again; no wallet has been replaced.');
      setSecurityReady(true);
    });
    const subscription = AppState.addEventListener('change', state => {
      walletSession.handleAppState(state);
    });
    walletSession.handleAppState(AppState.currentState);
    const timer = setInterval(() => walletSession.isUnlocked(), 1_000);
    return () => {
      active = false;
      unsubscribe();
      subscription.remove();
      clearInterval(timer);
      walletSession.lock();
      initializationGenerationRef.current += 1;
      startupSeedRef.current?.fill(0);
      startupSeedRef.current = null;
      hederaPrivateKeyRef.current = null;
      runtime.reset();
    };
  }, [clearRuntimeState]);

  const lockWallet = useCallback(() => walletSession.lock(), []);

  const beginBackup = useCallback(() => setBackupStatus(current => current === 'required' || current === 'deferred' ? 'reviewing' : current), []);
  const saveBackupStatus = useCallback(async (status: 'deferred' | 'verified') => {
    const assertUnlocked = walletSession.capture();
    if (!hederaPublicKey) throw new Error('Wallet is not ready.');
    await setSecureItem(BACKUP_STATUS_KEY, JSON.stringify({ publicKey: hederaPublicKey, status }));
    assertUnlocked();
    setBackupStatus(status);
  }, [hederaPublicKey]);
  const deferBackup = useCallback(() => saveBackupStatus('deferred'), [saveBackupStatus]);
  const markBackupVerified = useCallback(() => saveBackupStatus('verified'), [saveBackupStatus]);

  const connectSpark = useCallback(async (seed: Uint8Array, generation: number) => {
    const assertRuntimeCurrent = walletSession.captureRuntime();
    setSparkStatus('connecting');
    setSparkError(null);
    try {
      const spark = await sparkResource.current.initialize(signal => retryWithBackoff(
        async () => {
          await yieldToUi();
          if (signal.aborted) throw new Error('Spark startup was cancelled.');
          assertRuntimeCurrent();
          recordWalletStartupStage('spark_init_started');
          return measurePerformance('wallet.spark_initialize', () => initializeSparkWallet(seed, signal));
        },
        { maxAttempts: 3, baseDelayMs: 750, maxDelayMs: 3_000 },
      ));
      if (!spark || initializationGenerationRef.current !== generation) return;
      assertRuntimeCurrent();
      setSparkWallet(spark);
      setSparkStatus('ready');
      recordWalletStartupStage('lightning_ready');
    } catch (cause) {
      if (initializationGenerationRef.current !== generation) return;
      const message = cause instanceof Error ? cause.message : 'Lightning wallet initialization failed.';
      setSparkWallet(null);
      setSparkStatus('error');
      setSparkError(message);
    } finally {
      seed.fill(0);
      if (startupSeedRef.current === seed) startupSeedRef.current = null;
    }
  }, []);

  const initializeMnemonic = useCallback(
    async (mnemonic: string) => {
      const assertUnlocked = walletSession.capture();
      const generation = ++initializationGenerationRef.current;
      setInitStatus('Deriving wallet keys...');
      // This independent secure-store read can overlap native seed derivation.
      // Observe rejection immediately so a failed derivation cannot leave an
      // unhandled backup-status promise behind.
      const savedBackupPromise = getSecureItem(BACKUP_STATUS_KEY).then(
        value => ({ ok: true as const, value }),
        cause => ({ ok: false as const, cause }),
      );
      const savedIdentityPromise = getSecureItem(WALLET_IDENTITY_KEY).then(
        value => ({ ok: true as const, value }),
        cause => ({ ok: false as const, cause }),
      );
      await yieldToUi();
      assertUnlocked();
      recordWalletStartupStage('seed_derivation_started');
      const seed = await measurePerformance('wallet.seed_derivation', () => deriveAuthenticatedWalletSeed(mnemonic));
      // Native work can finish after a lock. Never publish/use its late result.
      let handedToSpark = false;
      const eraseSeed = () => {
        seed.fill(0);
        if (startupSeedRef.current === seed) startupSeedRef.current = null;
      };
      try {
        assertUnlocked();
        if (initializationGenerationRef.current !== generation) return;
        startupSeedRef.current = seed;
        recordWalletStartupStage('seed_derivation_complete');
        recordWalletStartupStage('key_derivation_started');
        const hederaPrivateKey = deriveHederaPrivateKeyFromSeed(seed);
        const publicKey = hederaPrivateKey.publicKey.toStringRaw().toLowerCase();
        const identityResult = await savedIdentityPromise;
        if (!identityResult.ok) throw identityResult.cause;
        if (identityResult.value && identityResult.value !== publicKey) {
          throw new Error('Saved wallet identity does not match these recovery words.');
        }
        if (!identityResult.value) await setSecureItem(WALLET_IDENTITY_KEY, publicKey);
        assertUnlocked();
        recordWalletStartupStage('key_derivation_complete');
        const backupResult = await savedBackupPromise;
        if (!backupResult.ok) throw backupResult.cause;
        const savedBackup = backupResult.value;
        assertUnlocked();
        recordWalletStartupStage('backup_status_loaded');

        if (initializationGenerationRef.current !== generation) return;
        hederaPrivateKeyRef.current = hederaPrivateKey;
        setBackupStatus(readBackupStatus(savedBackup, publicKey));
        setHederaPublicKey(hederaPrivateKey.publicKey.toStringRaw().toLowerCase());
        setHederaAccount(null);
        setSparkWallet(null);
        setWalletReady(true);
        setRecoveryRequired(false);
        recordWalletStartupStage('keys_ready');
        setInitStatus('Ready');

        // Show the wallet shell immediately while Bitcoin connects in the
        // background. Keys and network readiness are separate states.
        void connectSpark(seed, generation);
        handedToSpark = true;
      } finally {
        if (!handedToSpark) eraseSeed();
      }
    },
    [connectSpark],
  );

  const retrySparkConnection = useCallback(async () => {
    if (!walletSession.isUnlocked() || !walletReady || !hederaPublicKey) {
      throw new Error('Unlock your wallet to continue.');
    }
    if (sparkWallet) return;
    if (sparkResource.current.hasUnsettledStartup()) {
      setSparkStatus('error');
      setSparkError('The previous Bitcoin connection has not stopped. Close Opago completely and reopen it before retrying.');
      return;
    }
    if (sparkRetryRef.current) return sparkRetryRef.current;
    const retry = (async () => {
      const assertRuntimeCurrent = walletSession.captureRuntime();
      const generation = initializationGenerationRef.current;
      setSparkStatus('connecting');
      setSparkError(null);
      let seed: Uint8Array | null = null;
      try {
        const mnemonic = await withProtectedWalletAccess(() => getSecureItem(MNEMONIC_STORE_KEY));
        assertRuntimeCurrent();
        if (!mnemonic) throw new Error('This wallet’s keys are unavailable. Restore your paper backup; a new wallet will not be created automatically.');
        seed = await deriveAuthenticatedWalletSeed(mnemonic);
        assertRuntimeCurrent();
        if (deriveHederaPrivateKeyFromSeed(seed).publicKey.toStringRaw().toLowerCase() !== hederaPublicKey) {
          throw new Error('Saved wallet identity does not match these recovery words.');
        }
        startupSeedRef.current = seed;
        await connectSpark(seed, generation);
      } catch (cause) {
        seed?.fill(0);
        if (initializationGenerationRef.current !== generation) return;
        setSparkStatus('error');
        setSparkError(cause instanceof Error ? cause.message : 'Lightning wallet initialization failed.');
      }
    })().finally(() => { sparkRetryRef.current = null; });
    sparkRetryRef.current = retry;
    return retry;
  }, [connectSpark, hederaPublicKey, sparkWallet, walletReady]);

  const runExclusive = useCallback(async (operation: () => Promise<void>) => {
    if (initializationRef.current) return initializationRef.current;
    setIsInitializing(true);
    setError(null);
    const promise = operation()
      .catch(cause => {
        const message = cause instanceof Error ? cause.message : 'Wallet initialization failed.';
        clearRuntimeState();
        setError(message);
        throw cause;
      })
      .finally(() => {
        setIsInitializing(false);
        initializationRef.current = null;
      });
    initializationRef.current = promise;
    return promise;
  }, [clearRuntimeState]);

  const loadOrGenerateWallet = useCallback(async () => {
    if (walletReady) return;
    return runExclusive(async () => {
      recordWalletStartupStage('mnemonic_read_started');
      let mnemonic: string | null;
      try {
        mnemonic = await measurePerformance('wallet.secure_read', () =>
          withProtectedWalletAccess(() => getSecureItem(MNEMONIC_STORE_KEY)));
      } catch (cause) {
        recordAuthDiagnostic('wallet_startup.failed', categorizeAuthFailure(cause));
        // A dismissed or interrupted Face ID prompt is not proof that the
        // stored key is gone. Keep the existing wallet and offer a retry.
        throw cause;
      }
      const assertUnlocked = walletSession.capture();
      assertUnlocked();
      recordWalletStartupStage('mnemonic_read_complete');
      if (!mnemonic) {
        if (await hasStoredMnemonic()) setRecoveryRequired(true);
        throw new Error('This wallet’s keys are unavailable. Restore your paper backup; a new wallet will not be created automatically.');
      }
      await initializeMnemonic(mnemonic);
    });
  }, [initializeMnemonic, runExclusive, walletReady]);

  const unlockWallet = useCallback(async () => {
    recordAuthDiagnostic('unlock.begin');
    try {
      // A protected iOS keychain read is itself the Face ID challenge. Reuse
      // its result to open the wallet instead of prompting and reading twice.
      // Legacy unprotected entries still require explicit device authorization.
      const protectedMnemonic = Platform.OS === 'ios'
        ? await measurePerformance('wallet.device_unlock', () =>
          readProtectedKeyForUnlock(getBiometricallyProtectedMnemonic))
        : null;
      if (!protectedMnemonic) {
        await measurePerformance('wallet.device_unlock', () =>
          authenticateDevice('Unlock Opago', { allowDeviceCredential: Platform.OS === 'android' }));
      }
      if (AppState.currentState !== 'active') throw new Error('Return to Opago and unlock again.');
      if (await getSecureItem(WALLET_WIPE_PENDING_KEY) === 'true') {
        const { resumePendingWalletWipe } = await import('../lib/wallet-wipe-native');
        await resumePendingWalletWipe();
      }
      if (AppState.currentState !== 'active') throw new Error('Return to Opago and unlock again.');
      beginWalletStartupTiming();
      walletSession.unlock();
      if (protectedMnemonic) await runExclusive(() => initializeMnemonic(protectedMnemonic));
      recordAuthDiagnostic('unlock.success');
    } catch (cause) {
      recordAuthDiagnostic('unlock.failed', categorizeAuthFailure(cause));
      throw cause;
    }
  }, [initializeMnemonic, runExclusive]);

  const createWallet = useCallback(async () => runExclusive(async () => {
    if (await hasStoredMnemonic()) throw new Error('A wallet already exists on this device. Unlock it instead.');
    // A fresh install may start while iOS still reports an inactive app. There
    // is no key to unlock; establish the session only after this fresh check.
    if (hasStoredWallet === false && AppState.currentState === 'active' && !walletSession.isUnlocked()) {
      walletSession.handleAppState('active');
      walletSession.unlock();
    }
    const assertBeforeAuthentication = walletSession.capture();
    assertBeforeAuthentication();
    const assertUnlocked = await authorizeWalletAction('Protect your new wallet');
    assertUnlocked();
    const mnemonic = generateMnemonic(128, size => Buffer.from(Crypto.getRandomBytes(size)));
    await deleteSecureItem(BACKUP_STATUS_KEY);
    await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
    setHasStoredWallet(true);
    assertUnlocked();
    await initializeMnemonic(mnemonic);
  }), [hasStoredWallet, initializeMnemonic, runExclusive]);

  const restoreWallet = useCallback(
    async (mnemonic: string) =>
      runExclusive(async () => {
        mnemonic = normalizeRecoveryMnemonic(mnemonic);
        const existingWallet = await hasStoredMnemonic();
        if (existingWallet && (!recoveryRequired || walletReady)) {
          throw new Error('Remove the current wallet through Settings before restoring a different wallet.');
        }
        if (!existingWallet && hasStoredWallet === false && AppState.currentState === 'active' && !walletSession.isUnlocked()) {
          walletSession.handleAppState('active');
          walletSession.unlock();
        }
        const assertBeforeAuthentication = walletSession.capture();
        assertBeforeAuthentication();
        let assertUnlocked = await authorizeWalletAction('Restore your wallet');
        assertUnlocked();
        if (existingWallet) {
          // A readable local mnemonic must never be replaced from onboarding.
          let readable: string | null = null;
          try { readable = await withProtectedWalletAccess(() => getSecureItem(MNEMONIC_STORE_KEY)); }
          catch { /* An invalidated protected entry may throw rather than return null. */ }
          assertUnlocked = walletSession.capture();
          assertUnlocked();
          if (readable) throw new Error('Remove the current wallet through Settings before restoring a different wallet.');
          const savedIdentity = await getSecureItem(WALLET_IDENTITY_KEY);
          const backupRecord = await getSecureItem(BACKUP_STATUS_KEY);
          let backupIdentity: string | null = null;
          try {
            const parsed = JSON.parse(backupRecord || 'null');
            if (typeof parsed?.publicKey === 'string') backupIdentity = parsed.publicKey;
          } catch { /* Invalid metadata cannot establish wallet identity. */ }
          if (!savedIdentity && !backupIdentity) {
            throw new Error('This device has no saved wallet identity to verify the recovery phrase. Recover on another device or contact support; never share your recovery words. Local payment records remain unchanged.');
          }
          const candidateSeed = await deriveAuthenticatedWalletSeed(mnemonic);
          let candidateIdentity: string;
          try { candidateIdentity = deriveHederaPrivateKeyFromSeed(candidateSeed).publicKey.toStringRaw().toLowerCase(); }
          finally { candidateSeed.fill(0); }
          assertUnlocked();
          if ((savedIdentity && savedIdentity !== candidateIdentity) ||
              (backupIdentity && backupIdentity !== candidateIdentity)) {
            throw new Error('These recovery words do not belong to the wallet on this device.');
          }
          clearRuntimeState();
          await replaceInaccessibleMnemonic(mnemonic);
          setHasStoredWallet(true);
          assertUnlocked();
          await initializeMnemonic(mnemonic);
          return;
        }
        clearRuntimeState();
        const previousMnemonic = await withProtectedWalletAccess(() => getSecureItem(MNEMONIC_STORE_KEY));
        assertUnlocked = walletSession.capture();
        try {
          await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
          setHasStoredWallet(true);
          assertUnlocked();
          await initializeMnemonic(mnemonic);
        } catch (cause) {
          if (previousMnemonic) await setSecureItem(MNEMONIC_STORE_KEY, previousMnemonic);
          else {
            await deleteSecureItem(MNEMONIC_STORE_KEY);
            await deleteSecureItem(WALLET_IDENTITY_KEY);
            setHasStoredWallet(false);
          }
          throw cause;
        }
      }),
    [clearRuntimeState, hasStoredWallet, initializeMnemonic, recoveryRequired, runExclusive, walletReady],
  );

  const refreshHederaAccount = useCallback(async () => {
    const assertUnlocked = walletSession.capture();
    const privateKey = hederaPrivateKeyRef.current;
    const generation = initializationGenerationRef.current;
    if (!walletReady || !privateKey) {
      throw new Error('Wallet keys are not ready for Hedera ' + HEDERA_NETWORK + '.');
    }
    // Home balance and history often start together. Share only in-flight reads;
    // signing below always resolves a fresh account independently.
    if (hederaLookupRef.current) return hederaLookupRef.current;
    const lookup = (async () => {
      const account = await resolveHederaWalletAccount(privateKey.publicKey);
      assertUnlocked();
      if (generation !== initializationGenerationRef.current || privateKey !== hederaPrivateKeyRef.current) {
        throw new Error('Wallet changed during Hedera account lookup.');
      }
      setHederaAccount(account);
      return account;
    })();
    hederaLookupRef.current = lookup;
    try { return await lookup; }
    finally {
      if (hederaLookupRef.current === lookup) hederaLookupRef.current = null;
    }
  }, [walletReady]);

  const sendHederaPayment = useCallback(
    async (input: {
      recipientAccountId: string;
      amountTinybars: bigint;
      checkoutRequest?: HederaCheckoutRequest;
    }) => {
      const privateKey = hederaPrivateKeyRef.current;
      if (!walletReady || !privateKey) {
        throw new Error('Wallet keys are not ready for Hedera ' + HEDERA_NETWORK + '.');
      }
      const hederaPaymentJournal = hederaPaymentJournalFor(HEDERA_NETWORK, privateKey.publicKey.toStringRaw().toLowerCase());
      const account = await resolveHederaWalletAccount(privateKey.publicKey);
      if (!account) {
        throw new Error(
          'No Hedera ' + HEDERA_NETWORK + ' account exists for this wallet key. Open Receive to activate it with an HBAR deposit.',
        );
      }
      if (!input.checkoutRequest) await hederaPaymentJournal.assertNoUnresolvedDirectPayment(account.accountId);
      const assertAuthorized = await authorizePayment();
      assertAuthorized();
      assertHederaPaymentBalance(
        input.amountTinybars,
        account.balanceTinybars,
        input.checkoutRequest ? 'checkout' : 'direct',
      );
      if (
        input.checkoutRequest &&
        (
          input.checkoutRequest.merchantAccountId !== input.recipientAccountId ||
          input.checkoutRequest.amountTinybars !== input.amountTinybars
        )
      ) {
        throw new Error('Checkout details changed before signing.');
      }
      const result = input.checkoutRequest
        ? await sendHederaCheckoutPayment({
            sourceAccountId: account.accountId,
            request: input.checkoutRequest,
            privateKey,
            assertAuthorized,
            lifecycle: {
              onSubmitted: submission => hederaPaymentJournal.recordSubmitted(submission),
              onResolved: resolution => hederaPaymentJournal.recordResolved(resolution),
            },
          })
        : await sendHederaTransfer({
            sourceAccountId: account.accountId,
            recipientAccountId: input.recipientAccountId,
            amountTinybars: input.amountTinybars,
            privateKey,
            assertAuthorized,
            lifecycle: {
              onSubmitted: submission => hederaPaymentJournal.recordSubmitted(submission),
              onResolved: resolution => hederaPaymentJournal.recordResolved(resolution),
            },
          });
      try {
        const refreshed = await loadHederaAccount(account.accountId, privateKey.publicKey);
        // A confirmed payment stays confirmed even if its session has ended.
        if (walletSession.isUnlocked() && hederaPrivateKeyRef.current === privateKey) setHederaAccount(refreshed);
      } catch {
        // A post-receipt balance refresh cannot invalidate a confirmed payment proof.
      }
      return result;
    },
    [walletReady],
  );

  const wipeWallet = useCallback(async () => {
    const assertUnlocked = walletSession.capture();
    assertUnlocked();
    await setSecureItem(WALLET_WIPE_PENDING_KEY, 'true');
    // Invalidate running payment/claim/reconciliation callbacks before erasing
    // storage, so they cannot repopulate the removed wallet's activity.
    walletSession.lock();
    if (initializationRef.current) {
      await withTimeout(initializationRef.current.catch(() => undefined), 30_000,
        'Wallet startup is still running. Restart Opago to finish removing this wallet.');
    }
    const { resumePendingWalletWipe } = await import('../lib/wallet-wipe-native');
    await resumePendingWalletWipe();
    clearRuntimeState();
    setRecoveryRequired(false);
    setHasStoredWallet(false);
    setBackupStatus('loading');
    if (AppState.currentState === 'active') walletSession.unlock();
  }, [clearRuntimeState]);

  const value = useMemo<WalletContextValue>(
    () => ({
      securityReady, hasStoredWallet, isLocked, unlockWallet, lockWallet, createWallet,
      backupStatus, beginBackup, deferBackup, markBackupVerified,
      isInitializing,
      initStatus,
      walletReady,
      sparkWallet,
      sparkStatus,
      sparkError,
      retrySparkConnection,
      hederaPublicKey,
      hederaAccount,
      error,
      recoveryRequired,
      loadOrGenerateWallet,
      restoreWallet,
      refreshHederaAccount,
      sendHederaPayment,
      wipeWallet,
    }),
    [
      securityReady, hasStoredWallet, isLocked, unlockWallet, lockWallet, createWallet,
      backupStatus, beginBackup, deferBackup, markBackupVerified,
      error,
      recoveryRequired,
      hederaAccount,
      hederaPublicKey,
      initStatus,
      isInitializing,
      loadOrGenerateWallet,
      refreshHederaAccount,
      restoreWallet,
      retrySparkConnection,
      sendHederaPayment,
      sparkError,
      sparkStatus,
      sparkWallet,
      walletReady,
      wipeWallet,
    ],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return React.createElement(WalletProviderCore, null, children);
}

export function useWalletAuth(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWalletAuth must be used inside WalletProvider.');
  return context;
}
