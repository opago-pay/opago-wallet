import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { appConfig } from '@/lib/config';
import { sendStyles as styles } from '@/app/send-styles';
import type { PaymentCurrency, PaymentSource, WalletBalances } from './types';

const CURRENCIES: PaymentCurrency[] = ['SAT', 'EUR'];

export function PaymentForm(props: {
  destination: string;
  amountInput: string;
  currency: PaymentCurrency;
  source: PaymentSource;
  balances: WalletBalances;
  balanceError: string | null;
  loading: boolean;
  walletReady: boolean;
  onDestinationChange(value: string): void;
  onAmountChange(value: string): void;
  onCurrencyChange(value: PaymentCurrency): void;
  onSourceChange(value: PaymentSource): void;
  onScan(): void;
  onReview(): void;
}) {
  const sources: [PaymentSource, string, string][] = [
    ['spark', 'Lightning', props.balances.spark + ' SAT'],
    ['solana', 'SOL', props.balances.sol.toFixed(4)],
    ['usdc', 'USDC', props.balances.usdc.toFixed(2)],
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Send and bridge</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} />
      </View>
      {!appConfig.isMainnet && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Safe development mode: real mainnet payments and Atomiq swaps are blocked.
          </Text>
        </View>
      )}
      {props.balanceError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{props.balanceError}</Text>
        </View>
      )}
      <View style={styles.card}>
        <View style={[styles.row, { alignItems: 'center' }]}>
          <TextInput
            style={[styles.input, styles.destinationInput, { flex: 1 }]}
            placeholder="BOLT11, Lightning Address or LNURL"
            placeholderTextColor="#666"
            value={props.destination}
            onChangeText={props.onDestinationChange}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity style={styles.scanButton} onPress={props.onScan}>
            <Text style={styles.scanText}>Scan</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>Amount (optional for fixed invoices)</Text>
        <TextInput
          style={styles.input}
          placeholder={props.currency === 'SAT' ? 'Satoshis' : 'Euro'}
          placeholderTextColor="#666"
          value={props.amountInput}
          onChangeText={props.onAmountChange}
          keyboardType="decimal-pad"
        />
        <View style={styles.row}>
          {CURRENCIES.map(item => (
            <TouchableOpacity
              key={item}
              style={[styles.selector, props.currency === item && styles.selectorActive]}
              onPress={() => props.onCurrencyChange(item)}
            >
              <Text style={[styles.selectorText, props.currency === item && styles.selectorTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Pay from</Text>
        <View style={styles.row}>
          {sources.map(([key, label, balance]) => (
            <TouchableOpacity
              key={key}
              style={[styles.selector, props.source === key && styles.selectorActive]}
              onPress={() => props.onSourceChange(key)}
            >
              <Text style={[styles.selectorText, props.source === key && styles.selectorTextActive]}>{label}</Text>
              <Text style={styles.optionMeta}>{balance}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.button} onPress={props.onReview} disabled={props.loading || !props.walletReady}>
          {props.loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Review payment</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
