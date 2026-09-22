// 'lightning' remains an alias for old navigation/storage clients, never a
// second asset. New presentation code uses bitcoin; journal keys are unchanged.
export type WalletAssetKey = 'bitcoin' | 'lightning' | 'hedera';

export interface WalletAssetPresentation {
  name: string;
  symbol: 'SAT' | 'HBAR';
  accent: string;
  description: string;
  networkLabel: string;
  networkBadge: '' | 'MAINNET' | 'REGTEST' | 'TESTNET';
}

const BASE_ASSETS = {
  lightning: {
    name: 'Bitcoin',
    symbol: 'SAT',
    accent: '#f7931a',
    description: 'One balance. Two payment routes.',
  },
  hedera: {
    name: 'HBAR',
    symbol: 'HBAR',
    accent: '#27d3b2',
    description: 'Fast payments with Hedera',
  },
} as const;

export function getWalletAssetPresentation(
  asset: WalletAssetKey,
  mainnetEnabled: boolean,
  hederaNetwork: 'testnet' | 'mainnet' = 'testnet',
): WalletAssetPresentation {
  const base = BASE_ASSETS[asset === 'bitcoin' ? 'lightning' : asset];
  if (asset === 'hedera') {
    return {
      ...base,
      networkLabel: 'Hedera ' + hederaNetwork,
      networkBadge: hederaNetwork === 'mainnet' ? 'MAINNET' : 'TESTNET',
    };
  }
  if (asset === 'lightning' || asset === 'bitcoin') {
    return {
      ...base,
      networkLabel: mainnetEnabled ? 'Bitcoin' : 'Bitcoin regtest',
      networkBadge: mainnetEnabled ? '' : 'REGTEST',
    };
  }
  throw new Error('Unsupported wallet asset.');
}

export function walletAssetKeyFromSymbol(symbol: string): WalletAssetKey {
  if (symbol === 'HBAR') return 'hedera';
  return 'bitcoin';
}
