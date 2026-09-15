export type WalletAssetKey = 'lightning' | 'solana' | 'usdc' | 'hedera';

export interface WalletAssetPresentation {
  name: string;
  symbol: 'SAT' | 'SOL' | 'USDC' | 'HBAR';
  accent: string;
  description: string;
  networkLabel: string;
  networkBadge: 'MAINNET' | 'REGTEST' | 'DEVNET' | 'TESTNET';
}

const BASE_ASSETS = {
  lightning: {
    name: 'Bitcoin',
    symbol: 'SAT',
    accent: '#f7931a',
    description: 'Fast payments with Lightning',
  },
  solana: {
    name: 'Solana',
    symbol: 'SOL',
    accent: '#14f195',
    description: 'SOL on the Solana network',
  },
  usdc: {
    name: 'USDC',
    symbol: 'USDC',
    accent: '#2775ca',
    description: 'Digital dollars on Solana',
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
