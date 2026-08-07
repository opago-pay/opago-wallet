import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateMnemonic } from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import type { PrivateKey } from '@hiero-ledger/sdk';
import { usePrivy } from '@privy-io/expo';
import * as Crypto from 'expo-crypto';
import { initializeSparkWallet } from '../lib/spark';
import {
  deleteSecureItem,
  getSecureItem,
  MNEMONIC_STORE_KEY,
  setSecureItem,
} from '../lib/storage';
import { wipeTransactions } from '../lib/database';
import { appConfig } from '../lib/config';
import { deriveHederaPrivateKey, deriveSolanaKeypair } from '../lib/wallet-keys';
import {
  findHederaTestnetAccount,
  loadHederaAccount,
  type HederaAccountSnapshot,
} from '../lib/hedera/account';
import { MAX_HEDERA_TRANSACTION_FEE_TINYBARS } from '../lib/hedera/config';
import {
  sendHederaTestnetTransfer,
  type HederaTransferResult,
} from '../lib/hedera/payments';

type SparkWalletInstance = Awaited<ReturnType<typeof initializeSparkWallet>>;
type PrivyClient = ReturnType<typeof usePrivy>;

interface WalletContextValue {
  isInitializing: boolean;
  initStatus: string;
  walletReady: boolean;
  sparkWallet: SparkWalletInstance | null;
  solanaAddress: string | null;
  solanaKeypair: Keypair | null;
  hederaPublicKey: string | null;
  hederaAccount: HederaAccountSnapshot | null;
  error: string | null;
  loadOrGenerateWallet(): Promise<void>;
  restoreWallet(mnemonic: string): Promise<void>;
  refreshHederaAccount(): Promise<HederaAccountSnapshot | null>;
  sendHederaPayment(input: {
    recipientAccountId: string;
    amountTinybars: bigint;
  }): Promise<HederaTransferResult>;
  wipeWallet(): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function WalletProviderCore({
  children,
  privy,
}: {
  children: ReactNode;
  privy: PrivyClient | null;
}) {
  const initializationRef = useRef<Promise<void> | null>(null);
  const hederaPrivateKeyRef = useRef<PrivateKey | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [sparkWallet, setSparkWallet] = useState<SparkWalletInstance | null>(null);
  const [solanaKeypair, setSolanaKeypair] = useState<Keypair | null>(null);
  const [hederaPublicKey, setHederaPublicKey] = useState<string | null>(null);
  const [hederaAccount, setHederaAccount] = useState<HederaAccountSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearRuntimeState = useCallback(() => {
    setSparkWallet(null);
    setSolanaKeypair(null);
    hederaPrivateKeyRef.current = null;
    setWalletReady(false);
    setInitStatus('');
    setHederaPublicKey(null);
    setHederaAccount(null);
    setError(null);
  }, []);

  const initializeMnemonic = useCallback(
    async (mnemonic: string) => {
      setInitStatus('Deriving wallet keys...');
      const keypair = deriveSolanaKeypair(mnemonic);
      const hederaPrivateKey = deriveHederaPrivateKey(mnemonic);

      if (appConfig.importSolanaKeyToPrivy) {
        if (!privy) throw new Error('Privy wallet import is enabled but unavailable.');
        setInitStatus('Linking the explicitly enabled identity wallet...');
        const importer = (privy as unknown as {
          importWallet?: (input: { privateKey: string; chainType: 'solana' }) => Promise<unknown>;
        }).importWallet;
        if (!importer) throw new Error('Privy wallet import is enabled but unavailable.');
        await importer({
          privateKey: bs58.encode(keypair.secretKey),
          chainType: 'solana',
        });
      }

      setInitStatus('Starting Lightning wallet...');
      const spark = await initializeSparkWallet(mnemonic);
      hederaPrivateKeyRef.current = hederaPrivateKey;
      setSolanaKeypair(keypair);
      setHederaPublicKey(hederaPrivateKey.publicKey.toStringRaw().toLowerCase());
      setHederaAccount(null);
      setSparkWallet(spark);
      setWalletReady(true);
      setInitStatus('Ready');
    },
    [privy],
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
    if (!walletReady || !privateKey) {
      throw new Error('Wallet keys are not ready for Hedera testnet.');
    }
    const account = await findHederaTestnetAccount(privateKey.publicKey);
    setHederaAccount(account);
    return account;
  }, [walletReady]);

  const sendHederaPayment = useCallback(
    async (input: { recipientAccountId: string; amountTinybars: bigint }) => {
      const privateKey = hederaPrivateKeyRef.current;
      if (!walletReady || !privateKey) {
        throw new Error('Wallet keys are not ready for Hedera testnet.');
      }
      const account = await findHederaTestnetAccount(privateKey.publicKey);
      if (!account) {
        throw new Error(
          'No Hedera testnet account exists for this wallet key. Run the local provisioning script first.',
        );
      }
      if (
        input.amountTinybars + MAX_HEDERA_TRANSACTION_FEE_TINYBARS >
        account.balanceTinybars
      ) {
        throw new Error('Insufficient HBAR balance including the maximum transaction fee.');
      }
      const result = await sendHederaTestnetTransfer({
        sourceAccountId: account.accountId,
        recipientAccountId: input.recipientAccountId,
        amountTinybars: input.amountTinybars,
        privateKey,
      });
      const refreshed = await loadHederaAccount(account.accountId, privateKey.publicKey);
      setHederaAccount(refreshed);
      return result;
    },
    [walletReady],
  );

  const wipeWallet = useCallback(async () => {
    if (initializationRef.current) await initializationRef.current.catch(() => undefined);
    const atomiqKeys = (await AsyncStorage.getAllKeys()).filter(key =>
      key.startsWith('atomiq_sdk_'),
    );
    await Promise.all([
      deleteSecureItem(MNEMONIC_STORE_KEY),
      wipeTransactions(),
      atomiqKeys.length ? AsyncStorage.multiRemove(atomiqKeys) : Promise.resolve(),
    ]);
    if (privy?.logout) {
      await Promise.race([
        privy.logout(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Privy logout timed out.')), 5_000),
        ),
      ]).catch(() => undefined);
    }
    clearRuntimeState();
  }, [clearRuntimeState, privy]);

  const value = useMemo<WalletContextValue>(
    () => ({
      isInitializing,
      initStatus,
      walletReady,
      sparkWallet,
      solanaAddress: solanaKeypair?.publicKey.toBase58() || null,
      solanaKeypair,
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
      solanaKeypair,
      sparkWallet,
      walletReady,
      wipeWallet,
    ],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}

function PrivyWalletProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  return React.createElement(WalletProviderCore, { children, privy });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (appConfig.importSolanaKeyToPrivy) {
    return React.createElement(PrivyWalletProvider, { children });
  }
  return React.createElement(WalletProviderCore, { children, privy: null });
}

export function useWalletAuth(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWalletAuth must be used inside WalletProvider.');
  return context;
}
