import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { generateMnemonic } from 'bip39';
import type { PrivateKey } from '@hiero-ledger/sdk';
import * as Crypto from 'expo-crypto';
import { initializeSparkWallet } from '../lib/spark';
import {
  deleteSecureItem,
  getSecureItem,
  MNEMONIC_STORE_KEY,
  setSecureItem,
} from '../lib/storage';
import { wipeTransactions } from '../lib/database';
import { deriveHederaPrivateKey } from '../lib/wallet-keys';
import {
  loadHederaAccount,
  type HederaAccountSnapshot,
} from '../lib/hedera/account';
import {
  clearHederaAccountBindings,
  resolveHederaWalletAccount,
} from '../lib/hedera/account-binding-native';
import {
  getHederaPaymentFeeCeilingTinybars,
  HEDERA_NETWORK,
} from '../lib/hedera/config';
import {
  sendHederaCheckoutPayment,
  type HederaCheckoutRequest,
} from '../lib/hedera/checkout';
import {
  sendHederaTransfer,
  type HederaTransferResult,
} from '../lib/hedera/payments';
import { hederaPaymentJournal } from '../lib/hedera/payment-journal-native';
import { lightningPaymentJournal } from '../lib/lightning/payment-journal-native';
import { lightningReceiveStore } from '../lib/lightning/receive-store-native';
import { reconcileLightningPayments } from '../lib/lightning/reconcile-native';
import { operationalHealth } from '../lib/operational-health-native';
import { retryWithBackoff } from '../lib/retry';

type SparkWalletInstance = Awaited<ReturnType<typeof initializeSparkWallet>>;

interface WalletContextValue {
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
  const initializationRef = useRef<Promise<void> | null>(null);
  const initializationGenerationRef = useRef(0);
  const hederaPrivateKeyRef = useRef<PrivateKey | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [sparkWallet, setSparkWallet] = useState<SparkWalletInstance | null>(null);
  const [hederaPublicKey, setHederaPublicKey] = useState<string | null>(null);
  const [hederaAccount, setHederaAccount] = useState<HederaAccountSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearRuntimeState = useCallback(() => {
    initializationGenerationRef.current += 1;
    setSparkWallet(null);
    hederaPrivateKeyRef.current = null;
    setWalletReady(false);
    setInitStatus('');
    setHederaPublicKey(null);
    setHederaAccount(null);
    setError(null);
  }, []);

  const initializeMnemonic = useCallback(
    async (mnemonic: string) => {
      const generation = ++initializationGenerationRef.current;
      setInitStatus('Deriving wallet keys...');
      const hederaPrivateKey = deriveHederaPrivateKey(mnemonic);

      if (initializationGenerationRef.current !== generation) return;
      hederaPrivateKeyRef.current = hederaPrivateKey;
      setHederaPublicKey(hederaPrivateKey.publicKey.toStringRaw().toLowerCase());
      setHederaAccount(null);
      setSparkWallet(null);
      setWalletReady(true);
      setInitStatus('Ready');

      // Lightning is an optional asset. Its network startup must never block
      // the already-derived Hedera wallet from becoming usable.
      void retryWithBackoff(
        () => initializeSparkWallet(mnemonic),
        { maxAttempts: 3, baseDelayMs: 750, maxDelayMs: 3_000 },
      )
        .then(async spark => {
          if (initializationGenerationRef.current !== generation) return;
          setSparkWallet(spark);
          try {
            await reconcileLightningPayments(spark);
          } catch {
            // A temporary status lookup failure must not make the wallet unusable.
          }
        })
        .catch(cause => {
          if (initializationGenerationRef.current !== generation) return;
          const message = cause instanceof Error ? cause.message : 'Lightning wallet initialization failed.';
          setSparkWallet(null);
          setError('Lightning wallet unavailable: ' + message);
        });
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
      let mnemonic = await getSecureItem(MNEMONIC_STORE_KEY);
      if (!mnemonic) {
        setInitStatus('Generating a protected recovery phrase...');
        mnemonic = generateMnemonic(128, size => Buffer.from(Crypto.getRandomBytes(size)));
        await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
      }
      await initializeMnemonic(mnemonic);
    });
  }, [initializeMnemonic, runExclusive, walletReady]);

  const restoreWallet = useCallback(
    async (mnemonic: string) =>
      runExclusive(async () => {
        clearRuntimeState();
        const previousMnemonic = await getSecureItem(MNEMONIC_STORE_KEY);
        try {
          await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
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
    const privateKey = hederaPrivateKeyRef.current;
    const generation = initializationGenerationRef.current;
    if (!walletReady || !privateKey) {
      throw new Error('Wallet keys are not ready for Hedera ' + HEDERA_NETWORK + '.');
    }
    const account = await resolveHederaWalletAccount(privateKey.publicKey);
    if (generation !== initializationGenerationRef.current || privateKey !== hederaPrivateKeyRef.current) {
      throw new Error('Wallet changed during Hedera account lookup.');
    }
    setHederaAccount(account);
    return account;
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
      const account = await resolveHederaWalletAccount(privateKey.publicKey);
      if (!account) {
        throw new Error(
          'No Hedera ' + HEDERA_NETWORK + ' account exists for this wallet key. Open Receive to activate it with an HBAR deposit.',
        );
      }
      const feeCeilingTinybars = getHederaPaymentFeeCeilingTinybars(
        input.checkoutRequest ? 'checkout' : 'direct',
      );
      if (input.amountTinybars + feeCeilingTinybars > account.balanceTinybars) {
        throw new Error('Insufficient HBAR balance including the maximum transaction fee.');
      }
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
            lifecycle: {
              onSubmitted: submission => hederaPaymentJournal.recordSubmitted(submission),
              onResolved: resolution => hederaPaymentJournal.recordResolved(resolution),
            },
          });
      try {
        const refreshed = await loadHederaAccount(account.accountId, privateKey.publicKey);
        setHederaAccount(refreshed);
      } catch {
        // A post-receipt balance refresh cannot invalidate a confirmed payment proof.
      }
      return result;
    },
    [walletReady],
  );

  const wipeWallet = useCallback(async () => {
    if (initializationRef.current) await initializationRef.current.catch(() => undefined);
    await Promise.all([
      deleteSecureItem(MNEMONIC_STORE_KEY),
      wipeTransactions(),
      clearHederaAccountBindings(),
      hederaPaymentJournal.clear(),
      lightningPaymentJournal.clear(),
      lightningReceiveStore.clear(),
      operationalHealth.clear(),
    ]);
    clearRuntimeState();
  }, [clearRuntimeState]);

  const value = useMemo<WalletContextValue>(
    () => ({
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
