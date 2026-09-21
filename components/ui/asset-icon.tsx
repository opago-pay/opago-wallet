import { Ionicons } from '@expo/vector-icons';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { Image, StyleSheet, View } from 'react-native';
import {
  getWalletAssetPresentation,
  type WalletAssetKey,
} from '@/lib/wallet-assets';

export function AssetIcon(props: {
  asset: WalletAssetKey;
  size?: number;
}) {
  useLanguage();
  const size = props.size ?? 44;
  const presentation = getWalletAssetPresentation(props.asset, false);
  const glyphSize = Math.round(size * 0.5);

  return (
    <View
      accessible
      accessibilityLabel={t('{asset} icon', { asset: presentation.name })}
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
  return '#121a1a';
}

function iconBorder(asset: WalletAssetKey): string {
  if (asset === 'lightning') return 'rgba(255,255,255,0.22)';
  return 'rgba(39,211,178,0.65)';
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
