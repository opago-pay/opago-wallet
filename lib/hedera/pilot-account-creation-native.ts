import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountCreateTransaction, AccountId, Hbar, PrivateKey, PublicKey, TransactionId } from '@hiero-ledger/sdk';
import { findHederaAccount } from './account';
import { createHederaClient, HEDERA_NETWORK, parseHederaAccountId } from './config';
import { getMirrorAccountById } from './mirror';
import { parseHbarToTinybars } from './payments';

const JOURNAL_PREFIX = 'opago.hedera.pilot-account-creation.v2.';
const MAX_FEE_TINYBARS = 500_000_000n;

interface PilotActivationSettings {
  payerAccountId: string;
  maxFeeTinybars: bigint;
  privateKeyHex: string;
}

// Build-time values become part of the installed bundle. Use a separate,
// low-balance pilot payer account, never the normal Opago treasury account.
export function readPilotActivationSettings(): PilotActivationSettings | null {
  if (process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED !== 'true') return null;
  const payerAccountId = parseHederaAccountId(
    process.env.EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID || '',
    'Pilot payer account ID',
  );
  const privateKeyHex = (process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY || '').trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(privateKeyHex)) throw new Error('Pilot payer key is missing or invalid.');
  const maxFeeTinybars = parseHbarToTinybars(process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR || '2', 'Pilot account-creation fee limit');
  if (maxFeeTinybars > MAX_FEE_TINYBARS) throw new Error('Pilot account-creation fee limit is too large.');
  return { payerAccountId, maxFeeTinybars, privateKeyHex };
}

function parsePilotKey(hex: string, expected: PublicKey): PrivateKey {
  let key: PrivateKey;
  try {
    key = hex.length === 64
      ? expected.type === 'ED25519' ? PrivateKey.fromStringED25519(hex) : PrivateKey.fromStringECDSA(hex)
      : PrivateKey.fromStringDer(hex);
  } catch {
    throw new Error('Pilot payer key has an unsupported format.');
  }
  if (key.type !== expected.type || key.publicKey.toStringRaw() !== expected.toStringRaw()) {
    throw new Error('Pilot payer key does not match its account.');
  }
  return key;
}

function parsePayerPublicKey(type: string | null | undefined, value: string | null | undefined): PublicKey {
  try {
    if (type === 'ED25519') return PublicKey.fromStringED25519(value || '');
    if (type === 'ECDSA_SECP256K1') return PublicKey.fromStringECDSA(value || '');
  } catch { /* Report one fixed error without reflecting key material. */ }
  throw new Error('Pilot payer account key is unsupported.');
}

export async function activateNewPilotWallet(publicKey: string): Promise<void> {
  const settings = readPilotActivationSettings();
  if (!settings) return;
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('Pilot wallet public key is invalid.');
  const targetKey = PublicKey.fromStringED25519(publicKey);
  // A restored or externally created account must not be created again.
  if (await findHederaAccount(targetKey)) return;
  const journalKey = JOURNAL_PREFIX + HEDERA_NETWORK + '.' + publicKey;
  if (await AsyncStorage.getItem(journalKey)) return;

  const payer = await getMirrorAccountById(settings.payerAccountId);
  if (!payer || payer.deleted || payer.account !== settings.payerAccountId) {
    throw new Error('Pilot payer account is unavailable.');
  }
  const expectedKey = parsePayerPublicKey(payer.key?._type, payer.key?.key);
  const privateKey = parsePilotKey(settings.privateKeyHex, expectedKey);
  const balance = payer.balance?.balance;
  if (typeof balance !== 'string' || !/^\d+$/.test(balance) ||
      BigInt(balance) < settings.maxFeeTinybars) {
    throw new Error('Pilot payer account has insufficient or unknown balance.');
  }

  const client = createHederaClient();
  client.setOperator(AccountId.fromString(settings.payerAccountId), privateKey);
  client.setDefaultMaxTransactionFee(Hbar.fromTinybars(settings.maxFeeTinybars.toString()));
  client.setRequestTimeout(15_000);
  client.setMaxAttempts(2);
  try {
    const transactionId = TransactionId.generate(AccountId.fromString(settings.payerAccountId));
    const transaction = new AccountCreateTransaction()
      .setTransactionId(transactionId)
      .setRegenerateTransactionId(false)
      .setKey(targetKey)
      .setInitialBalance(Hbar.fromTinybars(0))
      .setTransactionMemo('Opago pilot account creation')
      .setMaxTransactionFee(Hbar.fromTinybars(settings.maxFeeTinybars.toString()))
      .freezeWith(client);
    const signed = await transaction.sign(privateKey);
    const transactionIdString = transactionId.toString();
    // Save before submission. An uncertain result blocks another automatic account creation.
    await AsyncStorage.setItem(journalKey, JSON.stringify({ transactionId: transactionIdString, state: 'pending' }));
    const response = await signed.execute(client);
    const receipt = await response.getReceipt(client);
    const status = receipt.status.toString();
    await AsyncStorage.setItem(journalKey, JSON.stringify({ transactionId: transactionIdString, state: status }));
    if (status !== 'SUCCESS') throw new Error('Pilot activation failed with Hedera status ' + status + '.');
  } finally {
    client.close();
  }
}
