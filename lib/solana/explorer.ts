import bs58 from 'bs58';
import { appConfig } from '../config';
import { parseSolanaPublicKey } from './config';

const SOLANA_EXPLORER_BASE = 'https://explorer.solana.com';

function clusterQuery(): string {
  return appConfig.isMainnet ? '' : '?cluster=devnet';
}

export function parseSolanaSignature(signature: string): string {
  const normalized = signature.trim();
  try {
    if (bs58.decode(normalized).length !== 64) throw new Error('invalid length');
  } catch {
    throw new Error('Solana transaction signature is invalid.');
  }
  return normalized;
}

export function getSolanaTransactionExplorerUrl(signature: string): string {
  return SOLANA_EXPLORER_BASE + '/tx/' + parseSolanaSignature(signature) + clusterQuery();
}

export function getSolanaAccountExplorerUrl(address: string): string {
  return SOLANA_EXPLORER_BASE + '/address/' + parseSolanaPublicKey(address).toBase58() + clusterQuery();
}

export function validateSolanaExplorerUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const expectedCluster = appConfig.isMainnet ? null : 'devnet';
  const path = url.pathname.split('/').filter(Boolean);
  const pathIsValid = path.length === 2 && (
    (path[0] === 'tx' && parseSolanaSignature(path[1]) === path[1]) ||
    (path[0] === 'address' && parseSolanaPublicKey(path[1]).toBase58() === path[1])
  );
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'explorer.solana.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    !pathIsValid ||
    url.searchParams.get('cluster') !== expectedCluster ||
    Array.from(url.searchParams.keys()).some(key => key !== 'cluster')
  ) {
    throw new Error('Only links for the configured Solana network can be opened.');
  }
  return url.toString();
}
