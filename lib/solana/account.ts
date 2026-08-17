import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { appConfig } from '../config';
import { withTimeout } from '../promise-timeout';
import { retryWithBackoff } from '../retry';
import {
  assertExpectedSolanaCluster,
  configuredUsdcMint,
  createSolanaReadConnection,
  SOLANA_COMMITMENT,
  SOLANA_RPC_TIMEOUT_MS,
} from './config';
import {
  formatSolanaAssetAmount,
  parseRpcAtomicAmount,
  type SolanaAsset,
} from './amounts';
import { getSolanaTransactionExplorerUrl, parseSolanaSignature } from './explorer';

export interface SolanaAccountSnapshot {
  address: string;
  balanceLamports: bigint;
  usdcBaseUnits: bigint;
  availability: {
    SOL: 'fresh' | 'stale' | 'unavailable';
    USDC: 'fresh' | 'stale' | 'unavailable';
  };
  warnings: string[];
}

export interface SolanaHistoryItem {
  signature: string;
  type: 'incoming' | 'outgoing';
  amountBaseUnits: bigint;
  amountDisplay: string;
  asset: SolanaAsset;
  status: 'confirmed' | 'finalized';
  occurredAt: string;
  explorerUrl: string;
}

export interface SolanaTransactionStatus {
  signature: string;
  state: 'pending' | 'success' | 'failed';
  result: string | null;
  confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
  explorerUrl: string;
}

export interface SolanaReceiveSnapshot {
  latestSignature: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Solana RPC request failed.';
}

function readWithRetry<T>(operation: () => Promise<T>, timeoutMessage: string): Promise<T> {
  return retryWithBackoff(
    () => withTimeout(operation(), SOLANA_RPC_TIMEOUT_MS, timeoutMessage),
    { maxAttempts: 2, baseDelayMs: 900, maxDelayMs: 1_800 },
  );
}

function collectParsedInstructions(transaction: unknown): unknown[] {
  if (!isRecord(transaction)) return [];
  const transactionData = isRecord(transaction.transaction) ? transaction.transaction : null;
  const message = transactionData && isRecord(transactionData.message) ? transactionData.message : null;
  const outer = message && Array.isArray(message.instructions) ? message.instructions : [];
  const meta = isRecord(transaction.meta) ? transaction.meta : null;
  const innerGroups = meta && Array.isArray(meta.innerInstructions) ? meta.innerInstructions : [];
  const inner = innerGroups.flatMap(group => {
    if (!isRecord(group) || !Array.isArray(group.instructions)) return [];
    return group.instructions;
  });
  return [...outer, ...inner];
}

function parseSystemTransfer(instruction: unknown): {
  source: string;
  destination: string;
  lamports: bigint;
} | null {
  if (!isRecord(instruction) || instruction.program !== 'system' || !isRecord(instruction.parsed)) {
    return null;
  }
  const parsed = instruction.parsed;
  if (typeof parsed.type !== 'string' || !parsed.type.startsWith('transfer') || !isRecord(parsed.info)) {
    return null;
  }
  if (typeof parsed.info.source !== 'string' || typeof parsed.info.destination !== 'string') return null;
  let lamports: bigint;
  try {
    lamports = parseRpcAtomicAmount(parsed.info.lamports, 'System transfer lamports');
  } catch {
    return null;
  }
  if (lamports <= 0n) return null;
  return { source: parsed.info.source, destination: parsed.info.destination, lamports };
}

export function getNativeTransferDeltaLamports(transaction: unknown, address: PublicKey): bigint {
  let delta = 0n;
  const walletAddress = address.toBase58();
  for (const instruction of collectParsedInstructions(transaction)) {
    const transfer = parseSystemTransfer(instruction);
    if (!transfer) continue;
    if (transfer.destination === walletAddress) delta += transfer.lamports;
    if (transfer.source === walletAddress) delta -= transfer.lamports;
  }
  return delta;
}

export function getTokenTransferDeltaBaseUnits(
  transaction: Pick<ParsedTransactionWithMeta, 'meta'> | unknown,
  owner: PublicKey,
  mint: PublicKey,
): bigint {
  if (!isRecord(transaction) || !isRecord(transaction.meta)) return 0n;
  const ownerAddress = owner.toBase58();
  const mintAddress = mint.toBase58();
  const sum = (balances: unknown): bigint => {
    if (!Array.isArray(balances)) return 0n;
    return balances.reduce((total: bigint, item: unknown) => {
      if (!isRecord(item) || item.owner !== ownerAddress || item.mint !== mintAddress) return total;
      const uiTokenAmount = isRecord(item.uiTokenAmount) ? item.uiTokenAmount : null;
      if (!uiTokenAmount) return total;
      try {
        return total + parseRpcAtomicAmount(uiTokenAmount.amount, 'Token balance');
      } catch {
        return total;
      }
    }, 0n);
  };
  return sum(transaction.meta.postTokenBalances) - sum(transaction.meta.preTokenBalances);
}

export async function loadSolanaAccount(address: PublicKey): Promise<SolanaAccountSnapshot> {
  const connection = createSolanaReadConnection();
  await readWithRetry(
    () => assertExpectedSolanaCluster(connection),
    'Solana network verification timed out.',
  );
  const balancePromise = readWithRetry(
    () => connection.getBalance(address, SOLANA_COMMITMENT),
    'SOL balance lookup timed out.',
  );
  const usdcPromise = (async () => {
    if (!appConfig.usdcMint) return 0n;
    try {
      const mint = configuredUsdcMint();
      const accounts = await readWithRetry(
        () => connection.getParsedTokenAccountsByOwner(
          address,
          { mint },
          SOLANA_COMMITMENT,
        ),
        'USDC balance lookup timed out.',
      );
      return accounts.value.reduce((total, account) => {
        const parsed = account.account.data;
        if (!('parsed' in parsed)) return total;
        const value = parsed.parsed?.info?.tokenAmount?.amount;
        return total + parseRpcAtomicAmount(value, 'USDC token balance');
      }, 0n);
    } catch (cause) {
      if (cause instanceof Error && /USDC is not configured/.test(cause.message)) return 0n;
      throw cause;
    }
  })();
  const [balanceResult, usdcResult] = await Promise.allSettled([balancePromise, usdcPromise]);
  if (balanceResult.status === 'rejected' && usdcResult.status === 'rejected') {
    throw new Error(
      'Solana balances are temporarily unavailable. SOL: ' + errorMessage(balanceResult.reason) +
      ' USDC: ' + errorMessage(usdcResult.reason),
    );
  }
  const warnings: string[] = [];
  if (balanceResult.status === 'rejected') warnings.push('SOL: ' + errorMessage(balanceResult.reason));
  if (usdcResult.status === 'rejected') warnings.push('USDC: ' + errorMessage(usdcResult.reason));
  return {
    address: address.toBase58(),
    balanceLamports: balanceResult.status === 'fulfilled'
      ? parseRpcAtomicAmount(balanceResult.value, 'SOL balance')
      : 0n,
    usdcBaseUnits: usdcResult.status === 'fulfilled' ? usdcResult.value : 0n,
    availability: {
      SOL: balanceResult.status === 'fulfilled' ? 'fresh' : 'unavailable',
      USDC: usdcResult.status === 'fulfilled' ? 'fresh' : 'unavailable',
    },
    warnings,
  };
}

export async function loadSolanaHistory(
  address: PublicKey,
  limit = 20,
): Promise<SolanaHistoryItem[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Solana history limit must be between 1 and 50.');
  }
  const connection = createSolanaReadConnection();
  await readWithRetry(
    () => assertExpectedSolanaCluster(connection),
    'Solana network verification timed out.',
  );
  const signatures = await readWithRetry(
    () => connection.getSignaturesForAddress(address, { limit }, SOLANA_COMMITMENT),
    'Solana history lookup timed out.',
  );
  if (signatures.length === 0) return [];
  const parsedTransactions = await readWithRetry(
    () => connection.getParsedTransactions(
      signatures.map(item => item.signature),
      { commitment: SOLANA_COMMITMENT, maxSupportedTransactionVersion: 0 },
    ),
    'Solana transaction history details timed out.',
  );
  let usdcMint: PublicKey | null = null;
  try {
    usdcMint = configuredUsdcMint();
  } catch {
    // Native SOL history remains available when USDC is not configured.
  }
  const items: SolanaHistoryItem[] = [];
  for (let index = 0; index < signatures.length; index += 1) {
    const signatureInfo = signatures[index];
    if (signatureInfo.err) continue;
    const transaction = parsedTransactions[index];
    if (!transaction?.meta || transaction.meta.err) continue;
    const occurredAt = transaction.blockTime
      ? new Date(transaction.blockTime * 1000).toISOString()
      : new Date(0).toISOString();
    const status = signatureInfo.confirmationStatus === 'finalized' ? 'finalized' : 'confirmed';
    if (usdcMint) {
      const tokenDelta = getTokenTransferDeltaBaseUnits(transaction, address, usdcMint);
      if (tokenDelta !== 0n) {
        const amountBaseUnits = tokenDelta < 0n ? -tokenDelta : tokenDelta;
        items.push({
          signature: signatureInfo.signature,
          type: tokenDelta > 0n ? 'incoming' : 'outgoing',
          amountBaseUnits,
          amountDisplay: formatSolanaAssetAmount(amountBaseUnits, 'USDC'),
          asset: 'USDC',
          status,
          occurredAt,
          explorerUrl: getSolanaTransactionExplorerUrl(signatureInfo.signature),
        });
        continue;
      }
    }
    const nativeDelta = getNativeTransferDeltaLamports(transaction, address);
    if (nativeDelta === 0n) continue;
    const amountBaseUnits = nativeDelta < 0n ? -nativeDelta : nativeDelta;
    items.push({
      signature: signatureInfo.signature,
      type: nativeDelta > 0n ? 'incoming' : 'outgoing',
      amountBaseUnits,
      amountDisplay: formatSolanaAssetAmount(amountBaseUnits, 'SOL'),
      asset: 'SOL',
      status,
      occurredAt,
      explorerUrl: getSolanaTransactionExplorerUrl(signatureInfo.signature),
    });
  }
  return items;
}

export async function loadSolanaTransactionStatus(
  rawSignature: string,
): Promise<SolanaTransactionStatus> {
  const signature = parseSolanaSignature(rawSignature);
  const connection = createSolanaReadConnection();
  await readWithRetry(
    () => assertExpectedSolanaCluster(connection),
    'Solana network verification timed out.',
  );
  const response = await readWithRetry(
    () => connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
    'Solana transaction status lookup timed out.',
  );
  const status = response.value[0];
  const explorerUrl = getSolanaTransactionExplorerUrl(signature);
  if (!status) {
    return { signature, state: 'pending', result: null, confirmationStatus: null, explorerUrl };
  }
  if (status.err) {
    return {
      signature,
      state: 'failed',
      result: 'TRANSACTION_FAILED',
      confirmationStatus: status.confirmationStatus || null,
      explorerUrl,
    };
  }
  if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
    return {
      signature,
      state: 'success',
      result: status.confirmationStatus.toUpperCase(),
      confirmationStatus: status.confirmationStatus,
      explorerUrl,
    };
  }
  return {
    signature,
    state: 'pending',
    result: null,
    confirmationStatus: status.confirmationStatus || null,
    explorerUrl,
  };
}

export async function getSolanaReceiveSnapshot(address: PublicKey): Promise<SolanaReceiveSnapshot> {
  const connection = createSolanaReadConnection();
  await readWithRetry(
    () => assertExpectedSolanaCluster(connection),
    'Solana network verification timed out.',
  );
  const signatures = await readWithRetry(
    () => connection.getSignaturesForAddress(address, { limit: 1 }, SOLANA_COMMITMENT),
    'Solana receive initialization timed out.',
  );
  return { latestSignature: signatures[0]?.signature || null };
}

export async function findNewConfirmedIncomingSolanaTransaction(input: {
  address: PublicKey;
  sinceSignature: string | null;
  asset: SolanaAsset;
  expectedAmountBaseUnits?: bigint | null;
}): Promise<SolanaHistoryItem | null> {
  const connection = createSolanaReadConnection();
  await readWithRetry(
    () => assertExpectedSolanaCluster(connection),
    'Solana network verification timed out.',
  );
  const signatures = await readWithRetry(
    () => connection.getSignaturesForAddress(input.address, { limit: 20 }, SOLANA_COMMITMENT),
    'Solana receive lookup timed out.',
  );
  const boundaryIndex = signatures.findIndex(item => item.signature === input.sinceSignature);
  const candidates = boundaryIndex >= 0
    ? signatures.slice(0, boundaryIndex)
    : signatures;
  if (candidates.length === 0) return null;
  const parsedTransactions = await readWithRetry(
    () => connection.getParsedTransactions(
      candidates.map(item => item.signature),
      { commitment: SOLANA_COMMITMENT, maxSupportedTransactionVersion: 0 },
    ),
    'Solana receive transaction details timed out.',
  );
  const usdcMint = input.asset === 'USDC' ? configuredUsdcMint() : null;
  for (let index = 0; index < candidates.length; index += 1) {
    const signatureInfo = candidates[index];
    if (signatureInfo.err) continue;
    const transaction = parsedTransactions[index];
    if (!transaction?.meta || transaction.meta.err) continue;
    const delta = input.asset === 'SOL'
      ? getNativeTransferDeltaLamports(transaction, input.address)
      : getTokenTransferDeltaBaseUnits(transaction, input.address, usdcMint!);
    if (delta <= 0n) continue;
    if (
      input.expectedAmountBaseUnits !== null &&
      input.expectedAmountBaseUnits !== undefined &&
      delta !== input.expectedAmountBaseUnits
    ) continue;
    return {
      signature: signatureInfo.signature,
      type: 'incoming',
      amountBaseUnits: delta,
      amountDisplay: formatSolanaAssetAmount(delta, input.asset),
      asset: input.asset,
      status: signatureInfo.confirmationStatus === 'finalized' ? 'finalized' : 'confirmed',
      occurredAt: transaction.blockTime
        ? new Date(transaction.blockTime * 1000).toISOString()
        : new Date(0).toISOString(),
      explorerUrl: getSolanaTransactionExplorerUrl(signatureInfo.signature),
    };
  }
  return null;
}

export async function getSolanaAssociatedTokenAddress(
  owner: PublicKey,
  mint = configuredUsdcMint(),
): Promise<PublicKey> {
  return getAssociatedTokenAddress(mint, owner);
}
