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
import { AppState } from 'react-native';
import { generateMnemonic } from 'bip39';
import type { PrivateKey } from '@hiero-ledger/sdk';
import * as Crypto from 'expo-crypto';
import { initializeSparkWallet } from '../lib/spark';
import {
  deleteSecureItem,
  getSecureItem,
  hasStoredMnemonic,
  MNEMONIC_STORE_KEY,
  setSecureItem,
} from '../lib/storage';
import { wipeTransactions } from '../lib/database';
import { deriveHederaPrivateKeyFromSeed } from '../lib/wallet-keys';
import { normalizeRecoveryMnemonic } from '../lib/wallet-seed';
import { deriveAuthenticatedWalletSeed } from '../lib/wallet-seed-native';
import {
  loadHederaAccount,
  type HederaAccountSnapshot,
} from '../lib/hedera/account';
import {
  clearHederaAccountBindings,
  resolveHederaWalletAccount,
} from '../lib/hedera/account-binding-native';
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
import { hederaPaymentJournal } from '../lib/hedera/payment-journal-native';
import { lightningPaymentJournal } from '../lib/lightning/payment-journal-native';
import { lightningReceiveStore } from '../lib/lightning/receive-store-native';
import { operationalHealth } from '../lib/operational-health-native';
import { retryWithBackoff } from '../lib/retry';
import { walletSession } from '../lib/wallet-session';
import { authenticateDevice, authorizeWalletAction } from '../lib/device-authentication';
import { authorizePayment } from '../lib/payment-authorization';
import { BACKUP_STATUS_KEY, readBackupStatus } from '../lib/wallet-backup';
import { SessionResource } from '../lib/session-resource';
import { yieldToUi } from '../lib/ui-ready';
import { homeBalancePreviewStore } from '../lib/home-balance-preview-native';
import { beginWalletStartupTiming, recordWalletStartupStage } from '../lib/startup-timing';

type SparkWalletInstance = Awaited<ReturnType<typeof initializeSparkWallet>>;

interface WalletContextValue {
  securityReady: boolean;
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
  hederaPublicKey: string | null;
  hederaAccount: HederaAccountSnapshot | null;
  error: string | null;
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
  const [isLocked, setIsLocked] = useState(true);
  const [backupStatus, setBackupStatus] = useState<WalletContextValue['backupStatus']>('loading');
  const initializationRef = useRef<Promise<void> | null>(null);
  const initializationGenerationRef = useRef(0);
  const hederaPrivateKeyRef = useRef<PrivateKey | null>(null);
  const startupSeedRef = useRef<Uint8Array | null>(null);
  const hederaLookupRef = useRef<Promise<HederaAccountSnapshot | null> | null>(null);
  const sparkResource = useRef(new SessionResource<SparkWalletInstance>());
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [sparkWallet, setSparkWallet] = useState<SparkWalletInstance | null>(null);
  const [hederaPublicKey, setHederaPublicKey] = useState<string | null>(null);
  const [hederaAccount, setHederaAccount] = useState<HederaAccountSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearRuntimeState = useCallback(() => {
    initializationGenerationRef.current += 1;
    startupSeedRef.current?.fill(0);
    startupSeedRef.current = null;
    sparkResource.current.reset();
    setSparkWallet(null);
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
    void hasStoredMnemonic().then(exists => {
      if (!active) return;
      if (!exists && AppState.currentState === 'active') walletSession.unlock();
      setSecurityReady(true);
    }).catch(() => {
      if (!active) return;
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

  const unlockWallet = useCallback(async () => {
    await authenticateDevice('Unlock Opago', { allowDeviceCredential: true });
    if (AppState.currentState !== 'active') throw new Error('Return to Opago and unlock again.');
    beginWalletStartupTiming();
    walletSession.unlock();
  }, []);
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

  const initializeMnemonic = useCallback(
    async (mnemonic: string) => {
      const assertUnlocked = walletSession.capture();
      const generation = ++initializationGenerationRef.current;
      setInitStatus('Deriving wallet keys...');
      await yieldToUi();
      assertUnlocked();
      recordWalletStartupStage('seed_derivation_started');
      const seed = await deriveAuthenticatedWalletSeed(mnemonic);
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
        recordWalletStartupStage('key_derivation_complete');
        const savedBackup = await getSecureItem(BACKUP_STATUS_KEY);
        assertUnlocked();
        recordWalletStartupStage('backup_status_loaded');

        if (initializationGenerationRef.current !== generation) return;
        hederaPrivateKeyRef.current = hederaPrivateKey;
        setBackupStatus(readBackupStatus(savedBackup, publicKey));
        setHederaPublicKey(hederaPrivateKey.publicKey.toStringRaw().toLowerCase());
        setHederaAccount(null);
        setSparkWallet(null);
        setWalletReady(true);
        recordWalletStartupStage('keys_ready');
        setInitStatus('Ready');

        // Show the wallet shell immediately while Bitcoin connects in the
        // background. The advanced HBAR account is resolved only on demand.
        const assertRuntimeCurrent = walletSession.captureRuntime();
        void sparkResource.current.initialize(() => retryWithBackoff(
          async () => {
            await yieldToUi();
            assertRuntimeCurrent();
            recordWalletStartupStage('spark_init_started');
            return initializeSparkWallet(seed);
          },
          { maxAttempts: 3, baseDelayMs: 750, maxDelayMs: 3_000 },
        ))
          .then(spark => {
            if (!spark || initializationGenerationRef.current !== generation) return;
            assertRuntimeCurrent();
            setSparkWallet(spark);
            recordWalletStartupStage('lightning_ready');
          })
          .catch(cause => {
            if (initializationGenerationRef.current !== generation) return;
            const message = cause instanceof Error ? cause.message : 'Lightning wallet initialization failed.';
            setSparkWallet(null);
            setError('Lightning wallet unavailable: ' + message);
          })
          .finally(eraseSeed);
        handedToSpark = true;
      } finally {
        if (!handedToSpark) eraseSeed();
      }
    },
    [],
  );

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
      const assertUnlocked = walletSession.capture();
      recordWalletStartupStage('mnemonic_read_started');
      const mnemonic = await getSecureItem(MNEMONIC_STORE_KEY);
      assertUnlocked();
      recordWalletStartupStage('mnemonic_read_complete');
      if (!mnemonic) throw new Error('This wallet’s keys are unavailable. Restore your paper backup; a new wallet will not be created automatically.');
      await initializeMnemonic(mnemonic);
    });
  }, [initializeMnemonic, runExclusive, walletReady]);

  const createWallet = useCallback(async () => runExclusive(async () => {
    const assertBeforeAuthentication = walletSession.capture();
    if (await hasStoredMnemonic()) throw new Error('A wallet already exists on this device. Unlock it instead.');
    assertBeforeAuthentication();
    const assertUnlocked = await authorizeWalletAction('Protect your new wallet');
    assertUnlocked();
    const mnemonic = generateMnemonic(128, size => Buffer.from(Crypto.getRandomBytes(size)));
    await deleteSecureItem(BACKUP_STATUS_KEY);
    await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
    assertUnlocked();
    await initializeMnemonic(mnemonic);
  }), [initializeMnemonic, runExclusive]);

  const restoreWallet = useCallback(
    async (mnemonic: string) =>
      runExclusive(async () => {
        const assertBeforeAuthentication = walletSession.capture();
        if (await hasStoredMnemonic()) throw new Error('Remove the current wallet through Security before restoring a different wallet.');
        // Validate before changing storage, then require device protection.
        mnemonic = normalizeRecoveryMnemonic(mnemonic);
        assertBeforeAuthentication();
        const assertUnlocked = await authorizeWalletAction('Restore your wallet');
        assertUnlocked();
        clearRuntimeState();
        const previousMnemonic = await getSecureItem(MNEMONIC_STORE_KEY);
        try {
          await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
          assertUnlocked();
          await initializeMnemonic(mnemonic);
        } catch (cause) {
          if (previousMnemonic) await setSecureItem(MNEMONIC_STORE_KEY, previousMnemonic);
          else await deleteSecureItem(MNEMONIC_STORE_KEY);
          throw cause;
        }
      }),
    [clearRuntimeState, initializeMnemonic, runExclusive],
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
      const assertAuthorized = await authorizePayment();
      const privateKey = hederaPrivateKeyRef.current;
      if (!walletReady || !privateKey) {
        throw new Error('Wallet keys are not ready for Hedera ' + HEDERA_NETWORK + '.');
      }
      const account = await resolveHederaWalletAccount(privateKey.publicKey);
      assertAuthorized();
      if (!account) {
        throw new Error(
          'No Hedera ' + HEDERA_NETWORK + ' account exists for this wallet key. Open Receive to activate it with an HBAR deposit.',
        );
      }
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
    if (initializationRef.current) await initializationRef.current.catch(() => undefined);
    assertUnlocked();
    // Invalidate running payment/claim/reconciliation callbacks before erasing
    // storage, so they cannot repopulate the removed wallet's activity.
    walletSession.lock();
    await Promise.all([
      deleteSecureItem(MNEMONIC_STORE_KEY),
      deleteSecureItem(BACKUP_STATUS_KEY),
      homeBalancePreviewStore.clear(),
      wipeTransactions(),
      clearHederaAccountBindings(),
      hederaPaymentJournal.clear(),
      lightningPaymentJournal.clear(),
      lightningReceiveStore.clear(),
      import('@/lib/bitcoin/store-native').then(({ bitcoinStore, bitcoinDepositWatch }) => Promise.all([bitcoinStore.clear(), bitcoinDepositWatch.clear()])),
      import('@/lib/bitcoin/receive-archive').then(({ clearBitcoinReceiveArchive }) => clearBitcoinReceiveArchive()),
      operationalHealth.clear(),
    ]);
    clearRuntimeState();
    setBackupStatus('loading');
    if (AppState.currentState === 'active') walletSession.unlock();
  }, [clearRuntimeState]);

  const value = useMemo<WalletContextValue>(
    () => ({
      securityReady, isLocked, unlockWallet, lockWallet, createWallet,
      backupStatus, beginBackup, deferBackup, markBackupVerified,
      isInitializing,
      initStatus,
      walletReady,
      sparkWallet,
      hederaPublicKey,
      hederaAccount,
      error,
      loadOrGenerateWallet,
      restoreWallet,
      refreshHederaAccount,
      sendHederaPayment,
      wipeWallet,
    }),
    [
      securityReady, isLocked, unlockWallet, lockWallet, createWallet,
      backupStatus, beginBackup, deferBackup, markBackupVerified,
      error,
      hederaAccount,
      hederaPublicKey,
      initStatus,
      isInitializing,
      loadOrGenerateWallet,
      refreshHederaAccount,
      restoreWallet,
      sendHederaPayment,
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
