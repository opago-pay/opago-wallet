import { Buffer } from 'buffer';
import type { Keypair, PublicKey, Signer } from '@solana/web3.js';
import { appConfig, assertMainnetPaymentsEnabled } from './config';
import { decodeLightningInvoice, resolveInvoiceAmount } from './lightning';

if (typeof global.Buffer === 'undefined') global.Buffer = Buffer;

interface AtomiqTokenAmount {
  amount?: unknown;
  rawAmount?: unknown;
}

interface AtomiqExecutionCallbacks {
  onSourceTransactionSent?(txId: string): void;
  onSourceTransactionConfirmed?(txId: string): void;
  onSwapSettled?(txId: string): void;
}

export interface AtomiqSolanaSigner {
  getAddress(): string;
}

export interface AtomiqSwap {
  getInput(): AtomiqTokenAmount | null | undefined;
  getOutput(): AtomiqTokenAmount | null | undefined;
  getQuoteExpiry?(): unknown;
  getOutputTxId?(): unknown;
  execute(signer: AtomiqSolanaSigner, callbacks?: AtomiqExecutionCallbacks): Promise<boolean>;
}

interface AtomiqSwapper {
  init(): Promise<void>;
  swap(
    fromToken: unknown,
    toToken: unknown,
    amount: string | undefined,
    amountType: unknown,
    address: string,
    invoice: string,
  ): Promise<unknown>;
}

interface AtomiqTokens {
  SOLANA: { SOL?: unknown; USDC?: unknown };
  BITCOIN: { BTCLN?: unknown };
}

interface AtomiqFactory {
  Tokens: AtomiqTokens;
  newSwapper(options: {
    chains: { SOLANA: { rpcUrl: string } };
    bitcoinNetwork: unknown;
    swapStorage(chainId: string): unknown;
    chainStorageCtor(name: string): unknown;
  }): AtomiqSwapper;
}

interface AtomiqSdkModule {
  SwapperFactory: new (initializers: readonly unknown[]) => AtomiqFactory;
  BitcoinNetwork: { MAINNET: unknown };
  SwapAmountType: { EXACT_OUT: unknown };
}

type VersionedSignableTransaction = {
  readonly version: unknown;
  sign(signers: Signer[]): void;
};

type LegacySignableTransaction = {
  partialSign(...signers: Signer[]): void;
};

type SignableTransaction = VersionedSignableTransaction | LegacySignableTransaction;

interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction<T extends SignableTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends SignableTransaction>(transactions: T[]): Promise<T[]>;
}

interface AtomiqSolanaModule {
  SolanaInitializer: unknown;
  SolanaSigner: new (wallet: AnchorWalletLike, keypair?: Signer) => AtomiqSolanaSigner;
}

interface AtomiqStorageModule {
  RNAsyncUnifiedStorage: new (prefix: string) => unknown;
  RNAsyncStorageManager: new (prefix: string) => unknown;
}

let atomiqSdk: AtomiqSdkModule | null = null;
let atomiqSolana: AtomiqSolanaModule | null = null;
let storageRnAsync: AtomiqStorageModule | null = null;
let factory: AtomiqFactory | null = null;
let swapper: AtomiqSwapper | null = null;
let swapperPromise: Promise<AtomiqSwapper> | null = null;
let tokens: AtomiqTokens | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loadModule(name: string): Record<string, unknown> {
  const loaded: unknown = require(name);
  if (!isRecord(loaded)) throw new Error(name + ' did not export a module object.');
  return loaded;
}

function ensureSDKLoaded(): void {
  if (factory) return;
  const sdkModule = loadModule('@atomiqlabs/sdk');
  const solanaModule = loadModule('@atomiqlabs/chain-solana');
  const storageModule = loadModule('@atomiqlabs/storage-rn-async');
  if (
    typeof sdkModule.SwapperFactory !== 'function' ||
    !isRecord(sdkModule.BitcoinNetwork) ||
    !isRecord(sdkModule.SwapAmountType) ||
    typeof solanaModule.SolanaSigner !== 'function' ||
    !('SolanaInitializer' in solanaModule) ||
    typeof storageModule.RNAsyncUnifiedStorage !== 'function' ||
    typeof storageModule.RNAsyncStorageManager !== 'function'
  ) {
    throw new Error('Atomiq SDK exports do not match the supported integration.');
  }

  atomiqSdk = sdkModule as unknown as AtomiqSdkModule;
  atomiqSolana = solanaModule as unknown as AtomiqSolanaModule;
  storageRnAsync = storageModule as unknown as AtomiqStorageModule;
  factory = new atomiqSdk.SwapperFactory([atomiqSolana.SolanaInitializer]);
  tokens = factory.Tokens;
}

function requireRuntime(): {
  sdk: AtomiqSdkModule;
  solana: AtomiqSolanaModule;
  storage: AtomiqStorageModule;
  activeFactory: AtomiqFactory;
  activeTokens: AtomiqTokens;
} {
  ensureSDKLoaded();
  if (!atomiqSdk || !atomiqSolana || !storageRnAsync || !factory || !tokens) {
    throw new Error('Atomiq SDK failed to initialize.');
  }
  return {
    sdk: atomiqSdk,
    solana: atomiqSolana,
    storage: storageRnAsync,
    activeFactory: factory,
    activeTokens: tokens,
  };
}

export async function getAtomiqSwapper(): Promise<AtomiqSwapper> {
  assertMainnetPaymentsEnabled('Atomiq swaps');
  const { sdk, storage, activeFactory } = requireRuntime();
  if (swapper) return swapper;
  if (swapperPromise) return swapperPromise;

  swapperPromise = (async () => {
    const instance = activeFactory.newSwapper({
      chains: { SOLANA: { rpcUrl: appConfig.solanaRpcUrl } },
      bitcoinNetwork: sdk.BitcoinNetwork.MAINNET,
      swapStorage: (chainId: string) =>
        new storage.RNAsyncUnifiedStorage('atomiq_sdk_chain_' + chainId + '_'),
      chainStorageCtor: (name: string) =>
        new storage.RNAsyncStorageManager('atomiq_sdk_store_' + name + '_'),
    });
    await instance.init();
    swapper = instance;
    return instance;
  })();

  try {
    return await swapperPromise;
  } finally {
    swapperPromise = null;
  }
}

function isVersionedTransaction(transaction: SignableTransaction): transaction is VersionedSignableTransaction {
  return 'version' in transaction && typeof transaction.sign === 'function';
}

function signOne<T extends SignableTransaction>(transaction: T, keypair: Keypair): T {
  if (isVersionedTransaction(transaction)) transaction.sign([keypair]);
  else transaction.partialSign(keypair);
  return transaction;
}

export function createAnchorWallet(keypair: Keypair): AnchorWalletLike {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends SignableTransaction>(transaction: T) => signOne(transaction, keypair),
    signAllTransactions: async <T extends SignableTransaction>(transactions: T[]) =>
      transactions.map(transaction => signOne(transaction, keypair)),
  };
}

function assertAtomiqSwap(value: unknown): asserts value is AtomiqSwap {
  if (
    !isRecord(value) ||
    typeof value.getInput !== 'function' ||
    typeof value.getOutput !== 'function' ||
    typeof value.execute !== 'function'
  ) {
    throw new Error('Atomiq returned an invalid quote.');
  }
}

export interface AtomiqQuoteResult {
  swap: AtomiqSwap;
  solanaSigner: AtomiqSolanaSigner;
}

export async function getAtomiqQuote(
  keypair: Keypair,
  destination: string,
  amountSat: number,
  assetType: 'SOL' | 'USDC' = 'SOL',
): Promise<AtomiqQuoteResult> {
  assertMainnetPaymentsEnabled('Atomiq swaps');
  const invoice = decodeLightningInvoice(destination);
  const verifiedAmount = resolveInvoiceAmount(invoice, amountSat);
  if (verifiedAmount !== amountSat) throw new Error('Swap amount does not match the invoice.');

  const { sdk, solana, activeTokens } = requireRuntime();
  const activeSwapper = await getAtomiqSwapper();
  const solanaSigner = new solana.SolanaSigner(createAnchorWallet(keypair), keypair);
  const fromToken = assetType === 'USDC' ? activeTokens.SOLANA.USDC : activeTokens.SOLANA.SOL;
  const toToken = activeTokens.BITCOIN.BTCLN;
  if (!fromToken || !toToken) throw new Error(assetType + ' is not supported by the Atomiq configuration.');

  const quote: unknown = await activeSwapper.swap(
    fromToken,
    toToken,
    invoice.amountSats === null ? (amountSat / 1e8).toFixed(8) : undefined,
    sdk.SwapAmountType.EXACT_OUT,
    solanaSigner.getAddress(),
    invoice.invoice,
  );
  assertAtomiqSwap(quote);
  const quotedOutputSats = Number(quote.getOutput()?.rawAmount);
  if (!Number.isSafeInteger(quotedOutputSats) || quotedOutputSats !== verifiedAmount) {
    throw new Error('Atomiq quote output does not match the requested Lightning amount.');
  }
  return { swap: quote, solanaSigner };
}

export class AtomiqExecutionError extends Error {
  constructor(message: string, readonly sourceTxId: string | null) {
    super(message);
    this.name = 'AtomiqExecutionError';
  }
}

export async function executeAtomiqQuote(swap: AtomiqSwap, solanaSigner: AtomiqSolanaSigner) {
  if (Number(swap.getQuoteExpiry?.()) <= Date.now()) throw new Error('Atomiq quote expired.');
  let sourceTxId: string | null = null;
  let destinationTxId: string | null = null;
  try {
    const success = await swap.execute(solanaSigner, {
      onSourceTransactionSent: (txId: string) => { sourceTxId = txId; },
      onSourceTransactionConfirmed: (txId: string) => { sourceTxId = txId; },
      onSwapSettled: (txId: string) => { destinationTxId = txId; },
    });
    if (!success) {
      throw new AtomiqExecutionError(
        'The swap was funded but the Lightning payment did not settle. Refund action may be required.',
        sourceTxId,
      );
    }
    const outputTxId = swap.getOutputTxId?.();
    const txId = destinationTxId || (typeof outputTxId === 'string' ? outputTxId : null) || sourceTxId;
    if (!txId) {
      throw new AtomiqExecutionError('Atomiq settled without returning a transaction reference.', sourceTxId);
    }
    return { txId, sourceTxId, destinationTxId };
  } catch (cause) {
    if (cause instanceof AtomiqExecutionError || !sourceTxId) throw cause;
    throw new AtomiqExecutionError(
      'The swap failed after its source transaction was sent. Review or refund it in Atomiq.',
      sourceTxId,
    );
  }
}
