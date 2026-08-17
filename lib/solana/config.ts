import { Connection, PublicKey } from '@solana/web3.js';
import { appConfig, assertSafeRemoteUrl } from '../config';
import {
  parseSolanaAssetAmount,
  type SolanaAsset,
} from './amounts';

export const SOLANA_NETWORK = appConfig.isMainnet ? 'mainnet-beta' : 'devnet';
export const SOLANA_COMMITMENT = 'confirmed' as const;
export const SOLANA_FINAL_COMMITMENT = 'finalized' as const;
export const SOLANA_RPC_TIMEOUT_MS = 20_000;
export const SOLANA_MAX_SEND_RETRIES = 3;
export const SOLANA_GENESIS_HASHES = Object.freeze({
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
});

let clusterVerification: Promise<void> | null = null;
let sharedConnection: Connection | null = null;
let sharedConnectionEndpoint: string | null = null;
let sharedReadConnection: Connection | null = null;
let sharedReadConnectionEndpoint: string | null = null;

export function parseSolanaPublicKey(raw: string, label = 'Solana address'): PublicKey {
  const normalized = raw.trim();
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(normalized);
  } catch {
    throw new Error(label + ' is invalid.');
  }
  if (publicKey.equals(PublicKey.default)) {
    throw new Error(label + ' cannot be the system program address.');
  }
  return publicKey;
}

export function configuredUsdcMint(): PublicKey {
  if (!appConfig.usdcMint) {
    throw new Error(
      'USDC is not configured for this Solana network. Set EXPO_PUBLIC_USDC_MINT to the reviewed mint.',
    );
  }
  return parseSolanaPublicKey(appConfig.usdcMint, 'Configured USDC mint');
}

export function assertSolanaTransferLimit(asset: SolanaAsset, amountBaseUnits: bigint): bigint {
  if (amountBaseUnits <= 0n) throw new Error(asset + ' amount must be greater than zero.');
  if (!appConfig.isMainnet) {
    const configuredMaximum = asset === 'SOL'
      ? appConfig.solanaMaxTestTransferSol
      : appConfig.solanaMaxTestTransferUsdc;
    const maximum = parseSolanaAssetAmount(configuredMaximum, asset);
    if (amountBaseUnits > maximum) {
      throw new Error(
        'Solana devnet transfers are limited to ' + configuredMaximum + ' ' + asset + '.',
      );
    }
  }
  return amountBaseUnits;
}

export function createSolanaConnection(): Connection {
  const endpoint = assertSafeRemoteUrl(appConfig.solanaRpcUrl, 'Solana RPC endpoint');
  const endpointUrl = endpoint.toString();
  if (sharedConnection && sharedConnectionEndpoint === endpointUrl) return sharedConnection;
  sharedConnectionEndpoint = endpointUrl;
  clusterVerification = null;
  sharedConnection = new Connection(endpointUrl, {
    commitment: SOLANA_COMMITMENT,
    confirmTransactionInitialTimeout: SOLANA_RPC_TIMEOUT_MS,
  });
  return sharedConnection;
}

export function createSolanaReadConnection(): Connection {
  const endpoint = assertSafeRemoteUrl(appConfig.solanaRpcUrl, 'Solana RPC endpoint');
  const endpointUrl = endpoint.toString();
  if (sharedReadConnection && sharedReadConnectionEndpoint === endpointUrl) {
    return sharedReadConnection;
  }
  sharedReadConnectionEndpoint = endpointUrl;
  clusterVerification = null;
  sharedReadConnection = new Connection(endpointUrl, {
    commitment: SOLANA_COMMITMENT,
    confirmTransactionInitialTimeout: SOLANA_RPC_TIMEOUT_MS,
    disableRetryOnRateLimit: true,
  });
  return sharedReadConnection;
}

export async function assertExpectedSolanaCluster(connection: Connection): Promise<void> {
  if (!clusterVerification) {
    clusterVerification = connection.getGenesisHash()
      .then(hash => {
        const expected = appConfig.isMainnet
          ? SOLANA_GENESIS_HASHES.mainnet
          : SOLANA_GENESIS_HASHES.devnet;
        if (hash !== expected) {
          throw new Error('Configured Solana RPC does not match the selected wallet network.');
        }
      })
      .catch(cause => {
        clusterVerification = null;
        throw cause;
      });
  }
  return clusterVerification;
}
