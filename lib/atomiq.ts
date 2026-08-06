import { Buffer } from 'buffer';
import { appConfig, assertMainnetPaymentsEnabled } from './config';
import { decodeLightningInvoice, resolveInvoiceAmount } from './lightning';

if (typeof global.Buffer === 'undefined') global.Buffer = Buffer;

let atomiqSdk: any;
let atomiqSolana: any;
let storageRnAsync: any;
let factory: any;
let swapper: any;
let swapperPromise: Promise<any> | null = null;

export let Tokens: any = null;

function ensureSDKLoaded(): void {
  if (factory) return;
  atomiqSdk = require('@atomiqlabs/sdk');
  atomiqSolana = require('@atomiqlabs/chain-solana');
  storageRnAsync = require('@atomiqlabs/storage-rn-async');
  factory = new atomiqSdk.SwapperFactory([atomiqSolana.SolanaInitializer]);
  Tokens = factory.Tokens;
}

export async function getAtomiqSwapper() {
  assertMainnetPaymentsEnabled('Atomiq swaps');
  ensureSDKLoaded();
  if (swapper) return swapper;
  if (swapperPromise) return swapperPromise;

  swapperPromise = (async () => {
    const instance = factory.newSwapper({
      chains: { SOLANA: { rpcUrl: appConfig.solanaRpcUrl } },
      bitcoinNetwork: atomiqSdk.BitcoinNetwork.MAINNET,
      swapStorage: (chainId: string) =>
        new storageRnAsync.RNAsyncUnifiedStorage('atomiq_sdk_chain_' + chainId + '_'),
      chainStorageCtor: (name: string) =>
        new storageRnAsync.RNAsyncStorageManager('atomiq_sdk_store_' + name + '_'),
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

interface SignableTransaction {
  version?: unknown;
  sign?: (signers: any[]) => void;
  partialSign?: (...signers: any[]) => void;
}

function signOne<T extends SignableTransaction>(transaction: T, keypair: any): T {
  if ('version' in transaction && typeof transaction.sign === 'function') {
    transaction.sign([keypair]);
    return transaction;
  }
  if (typeof transaction.partialSign === 'function') {
    transaction.partialSign(keypair);
    return transaction;
  }
  throw new Error('Atomiq returned an unsupported Solana transaction type.');
}

export function createAnchorWallet(keypair: any) {
  ensureSDKLoaded();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends SignableTransaction>(transaction: T) =>
      signOne(transaction, keypair),
    signAllTransactions: async <T extends SignableTransaction>(transactions: T[]) =>
      transactions.map(transaction => signOne(transaction, keypair)),
  };
}

export async function getAtomiqQuote(
  keypair: any,
  destination: string,
  amountSat: number,
  assetType: 'SOL' | 'USDC' = 'SOL',
) {
  assertMainnetPaymentsEnabled('Atomiq swaps');
  if (!keypair?.publicKey) throw new Error('Solana signer is unavailable.');
  const invoice = decodeLightningInvoice(destination);
  const verifiedAmount = resolveInvoiceAmount(invoice, amountSat);
  if (verifiedAmount !== amountSat) throw new Error('Swap amount does not match the invoice.');

  ensureSDKLoaded();
  const activeSwapper = await getAtomiqSwapper();
  const solanaSigner = new atomiqSolana.SolanaSigner(createAnchorWallet(keypair));
  const fromToken = assetType === 'USDC' ? Tokens.SOLANA.USDC : Tokens.SOLANA.SOL;
  if (!fromToken) throw new Error(assetType + ' is not supported by the Atomiq configuration.');

  const swap = await activeSwapper.swap(
    fromToken,
    Tokens.BITCOIN.BTCLN,
    invoice.amountSats === null ? (amountSat / 1e8).toFixed(8) : undefined,
    atomiqSdk.SwapAmountType.EXACT_OUT,
    solanaSigner.getAddress(),
    invoice.invoice,
  );
  if (!swap?.getInput?.()) throw new Error('Atomiq returned an invalid quote.');
  const quotedOutputSats = Number(swap.getOutput()?.rawAmount);
  if (!Number.isSafeInteger(quotedOutputSats) || quotedOutputSats !== verifiedAmount) {
    throw new Error('Atomiq quote output does not match the requested Lightning amount.');
  }
  return { swap, solanaSigner };
}

export class AtomiqExecutionError extends Error {
  constructor(message: string, readonly sourceTxId: string | null) {
    super(message);
    this.name = 'AtomiqExecutionError';
  }
}

export async function executeAtomiqQuote(swap: any, solanaSigner: any) {
  if (!swap || !solanaSigner) throw new Error('Atomiq quote is incomplete.');
  if (Number(swap.getQuoteExpiry?.()) <= Date.now()) throw new Error('Atomiq quote expired.');
  let sourceTxId: string | null = null;
  let destinationTxId: string | null = null;
  try {
    const success = await swap.execute(solanaSigner, {
      onSourceTransactionSent: (txId: string) => {
        sourceTxId = txId;
      },
      onSourceTransactionConfirmed: (txId: string) => {
        sourceTxId = txId;
      },
      onSwapSettled: (txId: string) => {
        destinationTxId = txId;
      },
    });
    if (!success) {
      throw new AtomiqExecutionError(
        'The swap was funded but the Lightning payment did not settle. Refund action may be required.',
        sourceTxId,
      );
    }
    const txId = destinationTxId || swap.getOutputTxId?.() || sourceTxId;
    if (typeof txId !== 'string' || !txId) {
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
