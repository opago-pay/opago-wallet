import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import { appConfig, assertSafeRemoteUrl } from './config';

export type SolanaAsset = 'SOL' | 'USDC';

const SOLANA_GENESIS_HASHES = Object.freeze({
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
});
let clusterVerification: Promise<void> | null = null;

async function assertExpectedCluster(connection: Connection): Promise<void> {
  if (!clusterVerification) {
    clusterVerification = connection.getGenesisHash().then(hash => {
      const expected = appConfig.isMainnet
        ? SOLANA_GENESIS_HASHES.mainnet
        : SOLANA_GENESIS_HASHES.devnet;
      if (hash !== expected) {
        throw new Error('Configured Solana RPC does not match the selected wallet network.');
      }
    }).catch(error => {
      clusterVerification = null;
      throw error;
    });
  }
  return clusterVerification;
}
export function createSolanaConnection(): Connection {
  const endpoint = assertSafeRemoteUrl(appConfig.solanaRpcUrl, 'Solana RPC endpoint');
  return new Connection(endpoint.toString(), 'confirmed');
}

function parsePositiveAmount(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transfer amount must be positive.');
  const multiplier = 10 ** decimals;
  const atomicAmount = Math.round(amount * multiplier);
  if (!Number.isSafeInteger(atomicAmount) || Math.abs(atomicAmount / multiplier - amount) > 1 / multiplier) {
    throw new Error('Transfer amount has too many decimal places.');
  }
  return BigInt(atomicAmount);
}
function getNativeTransferDeltaLamports(transaction: any, address: PublicKey): number {
  const outer = transaction?.transaction?.message?.instructions || [];
  const inner = (transaction?.meta?.innerInstructions || []).flatMap(
    (group: { instructions?: any[] }) => group.instructions || [],
  );
  let delta = 0;
  for (const instruction of [...outer, ...inner]) {
    const parsed = instruction?.parsed;
    const info = parsed?.info;
    if (
      instruction?.program !== 'system' ||
      !String(parsed?.type || '').startsWith('transfer') ||
      !Number.isSafeInteger(Number(info?.lamports))
    ) continue;
    const lamports = Number(info.lamports);
    if (info.destination === address.toBase58()) delta += lamports;
    if (info.source === address.toBase58()) delta -= lamports;
  }
  return delta;
}

export async function sendSolanaAsset(params: {
  keypair: Keypair;
  destination: string;
  amount: number;
  asset: SolanaAsset;
}): Promise<string> {
  const destinationOwner = new PublicKey(params.destination);
  const connection = createSolanaConnection();
  await assertExpectedCluster(connection);
  const transaction = new Transaction();

  if (params.asset === 'SOL') {
    const lamports = parsePositiveAmount(params.amount, 9);
    if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('SOL amount is too large.');
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: params.keypair.publicKey,
        toPubkey: destinationOwner,
        lamports: Number(lamports),
      }),
    );
  } else {
    if (!appConfig.usdcMint) {
      throw new Error('EXPO_PUBLIC_USDC_MINT is required for USDC transfers on this network.');
    }
    const mint = new PublicKey(appConfig.usdcMint);
    const sourceAccount = await getAssociatedTokenAddress(mint, params.keypair.publicKey);
    const destinationAccount = await getAssociatedTokenAddress(mint, destinationOwner);
    const [source, mintInfo, destinationInfo] = await Promise.all([
      getAccount(connection, sourceAccount, 'confirmed'),
      getMint(connection, mint, 'confirmed'),
      connection.getAccountInfo(destinationAccount, 'confirmed'),
    ]);
    if (!source.isInitialized) throw new Error('The source USDC account is not initialized.');
    if (mintInfo.decimals !== 6) throw new Error('Configured USDC mint does not use six decimals.');

    if (!destinationInfo) {
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          params.keypair.publicKey,
          destinationAccount,
          destinationOwner,
          mint,
        ),
      );
    }
    transaction.add(
      createTransferCheckedInstruction(
        sourceAccount,
        mint,
        destinationAccount,
        params.keypair.publicKey,
        parsePositiveAmount(params.amount, 6),
        6,
      ),
    );
  }

  return sendAndConfirmTransaction(connection, transaction, [params.keypair], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });
}

export async function getSolanaBalances(address: PublicKey): Promise<{ sol: number; usdc: number }> {
  const connection = createSolanaConnection();
  await assertExpectedCluster(connection);
  const lamports = await connection.getBalance(address, 'confirmed');
  let usdc = 0;
  if (appConfig.usdcMint) {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      address,
      { mint: new PublicKey(appConfig.usdcMint) },
      'confirmed',
    );
    usdc = accounts.value.reduce(
      (sum, account) =>
        sum + (Number(account.account.data.parsed.info.tokenAmount.uiAmount) || 0),
      0,
    );
  }
  return { sol: lamports / 1e9, usdc };
}
export interface SolanaReceiveSnapshot {
  balanceLamports: number;
  latestSignature: string | null;
}

export async function getSolanaReceiveSnapshot(address: PublicKey): Promise<SolanaReceiveSnapshot> {
  const connection = createSolanaConnection();
  await assertExpectedCluster(connection);
  const [balanceLamports, signatures] = await Promise.all([
    connection.getBalance(address, 'confirmed'),
    connection.getSignaturesForAddress(address, { limit: 1 }, 'confirmed'),
  ]);
  return { balanceLamports, latestSignature: signatures[0]?.signature || null };
}

export async function findConfirmedIncomingSol(
  address: PublicKey,
  sinceSignature: string | null,
): Promise<{ signature: string; amountSol: number } | null> {
  const connection = createSolanaConnection();
  await assertExpectedCluster(connection);
  const signatures = await connection.getSignaturesForAddress(address, { limit: 10 }, 'confirmed');
  for (const signatureInfo of signatures) {
    if (signatureInfo.signature === sinceSignature) break;
    if (signatureInfo.err) continue;
    const transaction = await connection.getParsedTransaction(signatureInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction?.meta || transaction.meta.err) continue;
    const increase = getNativeTransferDeltaLamports(transaction, address);
    if (increase > 0) {
      return { signature: signatureInfo.signature, amountSol: increase / 1e9 };
    }
  }
  return null;
}
export interface SolanaHistoryItem {
  txId: string;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: 'SOL' | 'USDC';
  status: 'confirmed';
  timestamp: string;
}

export async function getSolanaHistory(address: PublicKey): Promise<SolanaHistoryItem[]> {
  const connection = createSolanaConnection();
  await assertExpectedCluster(connection);
  const signatures = await connection.getSignaturesForAddress(address, { limit: 10 }, 'confirmed');
  const items: SolanaHistoryItem[] = [];

  for (const signatureInfo of signatures) {
    if (signatureInfo.err) continue;
    const transaction = await connection.getParsedTransaction(signatureInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction?.meta || transaction.meta.err) continue;
    const timestamp = transaction.blockTime
      ? new Date(transaction.blockTime * 1000).toISOString()
      : new Date().toISOString();

    if (appConfig.usdcMint) {
      const pre = (transaction.meta.preTokenBalances || [])
        .filter(balance => balance.owner === address.toBase58() && balance.mint === appConfig.usdcMint)
        .reduce((sum, balance) => sum + (Number(balance.uiTokenAmount.uiAmount) || 0), 0);
      const post = (transaction.meta.postTokenBalances || [])
        .filter(balance => balance.owner === address.toBase58() && balance.mint === appConfig.usdcMint)
        .reduce((sum, balance) => sum + (Number(balance.uiTokenAmount.uiAmount) || 0), 0);
      const tokenDelta = post - pre;
      if (Math.abs(tokenDelta) >= 0.000001) {
        items.push({
          txId: signatureInfo.signature,
          type: tokenDelta > 0 ? 'incoming' : 'outgoing',
          amount: Math.abs(tokenDelta),
          asset: 'USDC',
          status: 'confirmed',
          timestamp,
        });
        continue;
      }
    }

    const lamportDelta = getNativeTransferDeltaLamports(transaction, address);
    if (lamportDelta === 0) continue;
    items.push({
      txId: signatureInfo.signature,
      type: lamportDelta > 0 ? 'incoming' : 'outgoing',
      amount: Math.abs(lamportDelta) / 1e9,
      asset: 'SOL',
      status: 'confirmed',
      timestamp,
    });
  }
  return items;
}
