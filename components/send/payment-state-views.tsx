import { t } from '@/lib/i18n';
import { useLanguage } from '@/hooks/useLanguage';
import { ActivityIndicator, Text, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/wallet-interaction';
import { AssetIcon } from '@/components/ui/asset-icon';
import { walletAssetKeyFromSymbol } from '@/lib/wallet-assets';
import { sendStyles as styles } from '@/styles/send-styles';
import type { OcpOption, OcpState } from './types';

export function OcpQuoteView(props: {
  state: OcpState;
  selected: OcpOption | null;
  loading: boolean;
  onSelect(option: OcpOption): void;
  onExecute(): void;
  onCancel(): void;
}) {
  useLanguage();
  return (
    <View style={styles.container}>
      <Text style={styles.quoteTitle}>{props.state.quote.merchantName}</Text>
      <Text style={styles.subtitle}>
        {t("Total:")} {props.state.quote.fiatAmount} {props.state.quote.fiatCurrency}
      </Text>
      <View style={{ marginTop: 24 }}>
        {props.state.quote.transferAmounts.map(option => (
          <TouchableOpacity
            key={option.method + ':' + option.asset}
            style={[styles.option, props.selected === option && styles.optionActive]}
            onPress={() => props.onSelect(option)}
          >
            <View style={styles.optionIdentity}>
              <AssetIcon asset={walletAssetKeyFromSymbol(option.asset)} size={38} />
              <View>
              <Text style={styles.optionTitle}>{option.chain} {option.asset}</Text>
              <Text style={styles.optionMeta}>{t("Fee:")} {option.fee}</Text>
              </View>
            </View>
            <Text style={styles.optionTitle}>{option.amount}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.button, !props.selected && { opacity: 0.5 }]}
        onPress={props.onExecute}
        disabled={props.loading || !props.selected}
      >
        {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t("Review and pay")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={props.onCancel}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t("Cancel")}</Text>
      </TouchableOpacity>
    </View>
  );
}
