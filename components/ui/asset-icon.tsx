import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  getWalletAssetPresentation,
  type WalletAssetKey,
} from '@/lib/wallet-assets';

export function AssetIcon(props: {
  asset: WalletAssetKey;
  size?: number;
}) {
  const size = props.size ?? 44;
  const presentation = getWalletAssetPresentation(props.asset, false);
  const glyphSize = Math.round(size * 0.5);

  return (
    <View
      accessible
      accessibilityLabel={`${presentation.name} icon`}
      accessibilityRole="image"
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: iconBackground(props.asset),
          borderColor: iconBorder(props.asset),
        },
      ]}
    >
      {props.asset === 'lightning' && (
        <Ionicons name="flash" color="#fff" size={glyphSize} />
      )}
      {props.asset === 'solana' && (
        <View style={{ gap: Math.max(2, Math.round(size * 0.055)) }}>
          <View style={[styles.solanaBar, solanaBarStyle(size, '#14f195', -2)]} />
          <View style={[styles.solanaBar, solanaBarStyle(size, '#8b5cf6', 2)]} />
          <View style={[styles.solanaBar, solanaBarStyle(size, '#d946ef', -2)]} />
        </View>
      )}
      {props.asset === 'usdc' && (
        <Text style={[styles.usdcGlyph, { fontSize: Math.round(size * 0.53) }]}>$</Text>
      )}
      {props.asset === 'hedera' && (
        <Image
          source={require('../../assets/images/hedera-logo.png')}
          resizeMode="contain"
          style={{
            width: Math.round(size * 1.1),
            height: Math.round(size * 1.1),
          }}
        />
      )}
    </View>
  );
}

function iconBackground(asset: WalletAssetKey): string {
  if (asset === 'lightning') return '#f7931a';
  if (asset === 'solana') return '#17131f';
  if (asset === 'usdc') return '#2775ca';
  return '#121a1a';
}

function iconBorder(asset: WalletAssetKey): string {
  if (asset === 'lightning') return 'rgba(255,255,255,0.22)';
  if (asset === 'solana') return 'rgba(139,92,246,0.65)';
  if (asset === 'usdc') return 'rgba(255,255,255,0.28)';
  return 'rgba(39,211,178,0.65)';
}

function solanaBarStyle(size: number, backgroundColor: string, offset: number): ViewStyle {
  return {
    width: Math.round(size * 0.48),
    height: Math.max(3, Math.round(size * 0.105)),
    borderRadius: size,
    backgroundColor,
    transform: [
      { skewX: '-18deg' },
      { translateX: offset },
    ],
  };
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  solanaBar: {},
  usdcGlyph: {
    color: '#fff',
    fontWeight: '900',
  },
});
