export type WalletAssetKey = 'lightning' | 'solana' | 'usdc' | 'hedera';

export interface WalletAssetPresentation {
  name: string;
  symbol: 'SAT' | 'SOL' | 'USDC' | 'HBAR';
  accent: string;
  networkLabel: string;
  networkBadge: 'MAINNET' | 'REGTEST' | 'DEVNET' | 'TESTNET';
}

const BASE_ASSETS = {
  lightning: { name: 'Lightning', symbol: 'SAT', accent: '#f7931a' },
  solana: { name: 'Solana', symbol: 'SOL', accent: '#14f195' },
  usdc: { name: 'USD Coin', symbol: 'USDC', accent: '#2775ca' },
  hedera: { name: 'Hedera', symbol: 'HBAR', accent: '#27d3b2' },
} as const;

export function getWalletAssetPresentation(
  asset: WalletAssetKey,
  mainnetEnabled: boolean,
): WalletAssetPresentation {
  const base = BASE_ASSETS[asset];
  if (asset === 'hedera') {
    return {
      ...base,
      networkLabel: 'Hedera testnet',
      networkBadge: 'TESTNET',
    };
  }
  if (asset === 'lightning') {
    return {
      ...base,
      networkLabel: mainnetEnabled ? 'Bitcoin Lightning' : 'Bitcoin regtest',
      networkBadge: mainnetEnabled ? 'MAINNET' : 'REGTEST',
    };
  }
  return {
    ...base,
    networkLabel: mainnetEnabled ? 'Solana mainnet' : 'Solana devnet',
    networkBadge: mainnetEnabled ? 'MAINNET' : 'DEVNET',
  };
}

export function walletAssetKeyFromSymbol(symbol: string): WalletAssetKey {
  if (symbol === 'SOL') return 'solana';
  if (symbol === 'USDC') return 'usdc';
  if (symbol === 'HBAR') return 'hedera';
  return 'lightning';
}
