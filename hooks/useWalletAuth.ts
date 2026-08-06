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
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { HDKey } from 'micro-ed25519-hdkey';
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

type SparkWalletInstance = Awaited<ReturnType<typeof initializeSparkWallet>>;

interface WalletContextValue {
  isInitializing: boolean;
  initStatus: string;
  walletReady: boolean;
  sparkWallet: SparkWalletInstance | null;
  solanaAddress: string | null;
  solanaKeypair: Keypair | null;
  error: string | null;
  loadOrGenerateWallet(): Promise<void>;
  restoreWallet(mnemonic: string): Promise<void>;
  wipeWallet(): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const initializationRef = useRef<Promise<void> | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState('');
  const [walletReady, setWalletReady] = useState(false);
  const [sparkWallet, setSparkWallet] = useState<SparkWalletInstance | null>(null);
  const [solanaKeypair, setSolanaKeypair] = useState<Keypair | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearRuntimeState = useCallback(() => {
    setSparkWallet(null);
    setSolanaKeypair(null);
    setWalletReady(false);
    setInitStatus('');
    setError(null);
  }, []);

  const initializeMnemonic = useCallback(
    async (mnemonic: string) => {
      setInitStatus('Deriving wallet keys...');
      const seed = mnemonicToSeedSync(mnemonic);
      const hd = HDKey.fromMasterSeed(seed.toString('hex'));
      const derivedSeed = hd.derive("m/44'/501'/0'/0'").privateKey;
      const keypair = Keypair.fromSeed(derivedSeed);

      if (appConfig.importSolanaKeyToPrivy) {
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
      setSolanaKeypair(keypair);
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
    clearRuntimeState();
  }, [clearRuntimeState]);

  const value = useMemo<WalletContextValue>(
    () => ({
      isInitializing,
      initStatus,
      walletReady,
      sparkWallet,
      solanaAddress: solanaKeypair?.publicKey.toBase58() || null,
      solanaKeypair,
      error,
      loadOrGenerateWallet,
      restoreWallet,
      wipeWallet,
    }),
    [
      error,
      initStatus,
      isInitializing,
      loadOrGenerateWallet,
      restoreWallet,
      solanaKeypair,
      sparkWallet,
      walletReady,
      wipeWallet,
    ],
  );

  return React.createElement(WalletContext.Provider, { value }, children);
}

export function useWalletAuth(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWalletAuth must be used inside WalletProvider.');
  return context;
}
