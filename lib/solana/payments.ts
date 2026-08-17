import { Buffer } from 'buffer';
import bs58 from 'bs58';
import {
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import { withTimeout } from '../promise-timeout';
import {
  assertExpectedSolanaCluster,
  assertSolanaTransferLimit,
  configuredUsdcMint,
  createSolanaConnection,
  parseSolanaPublicKey,
  SOLANA_COMMITMENT,
  SOLANA_MAX_SEND_RETRIES,
  SOLANA_RPC_TIMEOUT_MS,
} from './config';
import {
  formatSolanaAssetAmount,
  parseRpcAtomicAmount,
  parseSolanaAssetAmount,
  type SolanaAsset,
} from './amounts';
import { getSolanaTransactionExplorerUrl } from './explorer';
import type { SolanaPaymentLifecycle } from './payment-journal';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface SolanaTransferResult {
  signature: string;
  status: 'CONFIRMED' | 'FINALIZED';
  asset: SolanaAsset;
  amountBaseUnits: bigint;
  amountDisplay: string;
  recipientAddress: string;
  explorerUrl: string;
}

export interface SolanaTransferInput {
  keypair: Keypair;
  recipientAddress: string;
  amountBaseUnits: bigint;
  asset: SolanaAsset;
  reference?: string | null;
  memo?: string | null;
  lifecycle?: SolanaPaymentLifecycle;
}

export class SolanaPaymentPendingError extends Error {
  constructor(
    message: string,
    readonly signature: string,
    readonly explorerUrl: string,
  ) {
    super(message);
    this.name = 'SolanaPaymentPendingError';
  }
}

function addReference(instruction: TransactionInstruction, reference?: string | null): void {
  if (!reference) return;
  instruction.keys.push({
    pubkey: parseSolanaPublicKey(reference, 'Solana payment reference'),
    isSigner: false,
    isWritable: false,
  });
}

function addMemo(transaction: Transaction, memo?: string | null): void {
  if (!memo) return;
  const bytes = Buffer.from(memo, 'utf8');
  if (bytes.length > 128) throw new Error('Solana payment memo is too long.');
  transaction.add(new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: bytes,
  }));
}

function simulationErrorMessage(logs: string[] | null | undefined): string {
  const programError = logs?.find(line => /Program log:|custom program error/i.test(line));
  return programError
    ? 'Solana transaction simulation failed: ' + programError.slice(0, 180)
    : 'Solana transaction simulation failed.';
}

export async function sendSolanaTransfer(
  input: SolanaTransferInput,
): Promise<SolanaTransferResult> {
  const amountBaseUnits = assertSolanaTransferLimit(input.asset, input.amountBaseUnits);
  const recipient = parseSolanaPublicKey(input.recipientAddress, 'Solana recipient');
  if (recipient.equals(input.keypair.publicKey)) {
    throw new Error('Source and recipient Solana addresses must be different.');
  }
  const connection = createSolanaConnection();
  await withTimeout(
    assertExpectedSolanaCluster(connection),
    SOLANA_RPC_TIMEOUT_MS,
    'Solana network verification timed out.',
  );
  const transaction = new Transaction();
  let requiredTokenAccountRent = 0n;

  if (input.asset === 'SOL') {
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: input.keypair.publicKey,
      toPubkey: recipient,
      lamports: amountBaseUnits,
    });
    addReference(transferInstruction, input.reference);
    transaction.add(transferInstruction);
  } else {
    const mint = configuredUsdcMint();
    const sourceAccount = await getAssociatedTokenAddress(mint, input.keypair.publicKey);
    const destinationAccount = await getAssociatedTokenAddress(mint, recipient);
    const [source, mintInfo, destinationInfo] = await withTimeout(
      Promise.all([
        getAccount(connection, sourceAccount, SOLANA_COMMITMENT),
        getMint(connection, mint, SOLANA_COMMITMENT),
        connection.getAccountInfo(destinationAccount, SOLANA_COMMITMENT),
      ]),
      SOLANA_RPC_TIMEOUT_MS,
      'Solana token-account validation timed out.',
    );
    if (!source.isInitialized || !source.owner.equals(input.keypair.publicKey) || !source.mint.equals(mint)) {
      throw new Error('The source USDC account is invalid.');
    }
    if (mintInfo.decimals !== 6) throw new Error('Configured USDC mint does not use six decimals.');
    if (source.amount < amountBaseUnits) throw new Error('Insufficient USDC balance.');
    if (!destinationInfo) {
      requiredTokenAccountRent = parseRpcAtomicAmount(
        await withTimeout(
          connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE, SOLANA_COMMITMENT),
          SOLANA_RPC_TIMEOUT_MS,
          'Solana rent lookup timed out.',
        ),
        'Associated token account rent',
      );
      transaction.add(createAssociatedTokenAccountIdempotentInstruction(
        input.keypair.publicKey,
        destinationAccount,
        recipient,
        mint,
      ));
    } else {
      const destination = await withTimeout(
        getAccount(connection, destinationAccount, SOLANA_COMMITMENT),
        SOLANA_RPC_TIMEOUT_MS,
        'Destination token-account validation timed out.',
      );
      if (!destination.owner.equals(recipient) || !destination.mint.equals(mint)) {
        throw new Error('The destination USDC account is invalid.');
      }
    }
    const transferInstruction = createTransferCheckedInstruction(
      sourceAccount,
      mint,
      destinationAccount,
      input.keypair.publicKey,
      amountBaseUnits,
      6,
    );
    addReference(transferInstruction, input.reference);
    transaction.add(transferInstruction);
  }
  addMemo(transaction, input.memo);

  const latestBlockhash = await withTimeout(
    connection.getLatestBlockhash(SOLANA_COMMITMENT),
    SOLANA_RPC_TIMEOUT_MS,
    'Solana blockhash lookup timed out.',
  );
  transaction.feePayer = input.keypair.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  const [feeResponse, payerBalance] = await withTimeout(
    Promise.all([
      connection.getFeeForMessage(transaction.compileMessage(), SOLANA_COMMITMENT),
      connection.getBalance(input.keypair.publicKey, SOLANA_COMMITMENT),
    ]),
    SOLANA_RPC_TIMEOUT_MS,
    'Solana fee validation timed out.',
  );
  if (feeResponse.value === null) throw new Error('Solana RPC could not calculate the transaction fee.');
  const feeLamports = parseRpcAtomicAmount(feeResponse.value, 'Solana transaction fee');
  const balanceLamports = parseRpcAtomicAmount(payerBalance, 'SOL balance');
  const requiredLamports = feeLamports + requiredTokenAccountRent +
    (input.asset === 'SOL' ? amountBaseUnits : 0n);
  if (balanceLamports < requiredLamports) {
    throw new Error('Insufficient SOL balance including fees and token-account rent.');
  }

  transaction.sign(input.keypair);
  const simulation = await withTimeout(
    connection.simulateTransaction(transaction),
    SOLANA_RPC_TIMEOUT_MS,
    'Solana transaction simulation timed out.',
  );
  if (simulation.value.err) throw new Error(simulationErrorMessage(simulation.value.logs));
  if (!transaction.signature) throw new Error('Solana transaction signature was not produced.');
  const preparedSignature = bs58.encode(transaction.signature);
  await input.lifecycle?.onSubmitted?.({
    signature: preparedSignature,
    recipientAddress: recipient.toBase58(),
    asset: input.asset,
    amountBaseUnits,
  });

  let broadcastSignature: string;
  try {
    broadcastSignature = await withTimeout(
      connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: SOLANA_COMMITMENT,
        maxRetries: SOLANA_MAX_SEND_RETRIES,
      }),
      SOLANA_RPC_TIMEOUT_MS,
      'Solana transaction submission timed out.',
    );
  } catch (cause) {
    if (cause instanceof SendTransactionError) {
      await input.lifecycle?.onResolved?.({
        signature: preparedSignature,
        state: 'failed',
        result: 'PREFLIGHT_REJECTED',
      });
    }
    throw cause;
  }
  if (broadcastSignature !== preparedSignature) {
    await input.lifecycle?.onResolved?.({
      signature: preparedSignature,
      state: 'failed',
      result: 'SIGNATURE_MISMATCH',
    });
    throw new Error('Solana RPC returned a different transaction signature.');
  }
  let confirmation;
  try {
    confirmation = await withTimeout(
      connection.confirmTransaction({
        signature: broadcastSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, SOLANA_COMMITMENT),
      SOLANA_RPC_TIMEOUT_MS,
      'Solana confirmation timed out.',
    );
  } catch {
    throw new SolanaPaymentPendingError(
      'The transaction was submitted but is not confirmed yet. Check Activity or Solana Explorer before retrying.',
      broadcastSignature,
      getSolanaTransactionExplorerUrl(broadcastSignature),
    );
  }
  if (confirmation.value.err) {
    await input.lifecycle?.onResolved?.({
      signature: broadcastSignature,
      state: 'failed',
      result: 'TRANSACTION_FAILED',
    });
    throw new Error('Solana transaction failed on-chain.');
  }
  await input.lifecycle?.onResolved?.({
    signature: broadcastSignature,
    state: 'confirmed',
    result: 'CONFIRMED',
  });
  return {
    signature: broadcastSignature,
    status: 'CONFIRMED',
    asset: input.asset,
    amountBaseUnits,
    amountDisplay: formatSolanaAssetAmount(amountBaseUnits, input.asset),
    recipientAddress: recipient.toBase58(),
    explorerUrl: getSolanaTransactionExplorerUrl(broadcastSignature),
  };
}

export async function sendSolanaAsset(params: {
  keypair: Keypair;
  destination: string;
  amount: number | string;
  asset: SolanaAsset;
}): Promise<string> {
  const result = await sendSolanaTransfer({
    keypair: params.keypair,
    recipientAddress: params.destination,
    amountBaseUnits: parseSolanaAssetAmount(String(params.amount), params.asset),
    asset: params.asset,
  });
  return result.signature;
}
