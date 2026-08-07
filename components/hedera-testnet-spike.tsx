import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import type { HederaAccountSnapshot, HederaTransferResult } from '@/lib/hedera';

export function HederaTestnetSpike() {
  const {
    walletReady,
    hederaPublicKey,
    getHederaTestnetAccount,
    sendHederaTestnetTransfer,
  } = useWalletAuth();
  const [account, setAccount] = useState<HederaAccountSnapshot | null>(null);
  const [recipientAccountId, setRecipientAccountId] = useState('');
  const [amountHbar, setAmountHbar] = useState('0.01');
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<HederaTransferResult | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!walletReady || !hederaPublicKey) return;
    setLoadingAccount(true);
    setMessage(null);
    try {
      const nextAccount = await getHederaTestnetAccount();
      setAccount(nextAccount);
      if (!nextAccount) {
        setMessage('No testnet account found. Run the local provisioning script with this public key.');
      }
    } catch (cause) {
      setAccount(null);
      setMessage(cause instanceof Error ? cause.message : 'Hedera account lookup failed.');
    } finally {
      setLoadingAccount(false);
    }
  }, [getHederaTestnetAccount, hederaPublicKey, walletReady]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  async function copyValue(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    await Haptics.selectionAsync();
    setMessage(label + ' copied.');
  }

  async function performTransfer() {
    setSending(true);
    setMessage(null);
    setResult(null);
    try {
      const transfer = await sendHederaTestnetTransfer({ recipientAccountId, amountHbar });
      setResult(transfer);
      setMessage('Testnet transfer confirmed.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshAccount();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'HBAR testnet transfer failed.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  }

  function confirmTransfer() {
    if (!account) {
      setMessage('Provision the Hedera testnet account before sending.');
      return;
    }
    Alert.alert(
      'Send testnet HBAR?',
      amountHbar +
        ' HBAR\nFrom ' +
        account.accountId +
        '\nTo ' +
        recipientAccountId.trim() +
        '\n\nThis signs directly on this Android device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send on testnet', onPress: () => void performTransfer() },
      ],
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Hedera SDK spike</Text>
          <Text style={styles.badge}>TESTNET ONLY</Text>
        </View>
        <TouchableOpacity
          style={styles.smallButton}
          onPress={() => void refreshAccount()}
          disabled={!walletReady || loadingAccount || sending}
        >
          {loadingAccount ? (
            <ActivityIndicator color="#ffb000" size="small" />
          ) : (
            <Text style={styles.smallButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.help}>
        The Ed25519 key is derived from the protected recovery phrase. Operator credentials are never
        included in the app.
      </Text>

      <Text style={styles.label}>WALLET PUBLIC KEY</Text>
      <TouchableOpacity
        style={styles.valueBox}
        onPress={() => hederaPublicKey && void copyValue(hederaPublicKey, 'Public key')}
        disabled={!hederaPublicKey}
      >
        <Text style={styles.monospace}>{hederaPublicKey || 'Wallet keys are not ready.'}</Text>
        {hederaPublicKey && <Text style={styles.copyHint}>Tap to copy for local provisioning</Text>}
      </TouchableOpacity>

      {account && (
        <View style={styles.accountBox}>
          <View>
            <Text style={styles.label}>ACCOUNT ID</Text>
            <Text style={styles.accountValue}>{account.accountId}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>BALANCE</Text>
            <Text style={styles.accountValue}>{account.balanceHbar} HBAR</Text>
          </View>
        </View>
      )}

      <Text style={styles.label}>TESTNET RECIPIENT</Text>
      <TextInput
        style={styles.input}
        value={recipientAccountId}
        onChangeText={setRecipientAccountId}
        placeholder="0.0.x"
        placeholderTextColor="#666673"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!sending}
      />
      <Text style={styles.label}>AMOUNT (MAX 1 HBAR)</Text>
      <TextInput
        style={styles.input}
        value={amountHbar}
        onChangeText={setAmountHbar}
        placeholder="0.01"
        placeholderTextColor="#666673"
        keyboardType="decimal-pad"
        editable={!sending}
      />
      <TouchableOpacity
        style={[styles.sendButton, (!account || sending) && styles.disabled]}
        onPress={confirmTransfer}
        disabled={!account || sending}
      >
        {sending ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={styles.sendButtonText}>Send HBAR on testnet</Text>
        )}
      </TouchableOpacity>

      {message && <Text style={result ? styles.success : styles.message}>{message}</Text>}
      {result && (
        <TouchableOpacity
          style={styles.resultBox}
          onPress={() => void copyValue(result.transactionId, 'Transaction ID')}
        >
          <Text style={styles.label}>CONFIRMED TRANSACTION</Text>
          <Text style={styles.monospace}>{result.transactionId}</Text>
          <Text style={styles.copyHint}>Tap to copy transaction ID</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 32,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 7 },
  badge: { color: '#8f7de8', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  help: { color: '#8f8f9d', lineHeight: 20, marginTop: 14, marginBottom: 18 },
  label: { color: '#8f8f9d', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 7 },
  valueBox: { backgroundColor: '#17171c', borderRadius: 12, padding: 14, marginBottom: 18 },
  monospace: { color: '#fff', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  copyHint: { color: '#ffb000', fontSize: 11, marginTop: 8 },
  accountBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(143,125,232,0.35)',
    backgroundColor: 'rgba(143,125,232,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  accountValue: { color: '#fff', fontWeight: '800' },
  input: {
    backgroundColor: '#17171c',
    borderColor: '#303039',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 14,
    minHeight: 50,
    marginBottom: 16,
  },
  sendButton: {
    backgroundColor: '#ffb000',
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: { color: '#111', fontWeight: '900' },
  disabled: { opacity: 0.45 },
  smallButton: {
    minWidth: 78,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3d3d48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: { color: '#ffb000', fontWeight: '800' },
  message: { color: '#ffcc66', marginTop: 14, lineHeight: 19 },
  success: { color: '#49d17d', marginTop: 14, lineHeight: 19 },
  resultBox: { backgroundColor: '#17171c', borderRadius: 12, padding: 14, marginTop: 14 },
});
