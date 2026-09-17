export type WalletAssetKey = 'lightning' | 'hedera';

export interface WalletAssetPresentation {
  name: string;
  symbol: 'SAT' | 'HBAR';
  accent: string;
  description: string;
  networkLabel: string;
  networkBadge: 'MAINNET' | 'REGTEST' | 'TESTNET';
}

const BASE_ASSETS = {
  lightning: {
    name: 'Bitcoin',
    symbol: 'SAT',
    accent: '#f7931a',
    description: 'Fast payments with Lightning',
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
  const base = BASE_ASSETS[asset];
  if (asset === 'hedera') {
    return {
      ...base,
      networkLabel: 'Hedera ' + hederaNetwork,
      networkBadge: hederaNetwork === 'mainnet' ? 'MAINNET' : 'TESTNET',
    };
  }
  if (asset === 'lightning') {
    return {
      ...base,
      networkLabel: mainnetEnabled ? 'Bitcoin Lightning' : 'Bitcoin regtest',
      networkBadge: mainnetEnabled ? 'MAINNET' : 'REGTEST',
    };
  }
  throw new Error('Unsupported wallet asset.');
}

export function walletAssetKeyFromSymbol(symbol: string): WalletAssetKey {
  if (symbol === 'HBAR') return 'hedera';
  return 'lightning';
}
