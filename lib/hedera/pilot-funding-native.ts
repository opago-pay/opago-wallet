import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccountId, Hbar, PrivateKey, PublicKey, TransactionId, TransferTransaction } from '@hiero-ledger/sdk';
import { findHederaAccount } from './account';
import { createHederaClient, HEDERA_NETWORK, parseHederaAccountId } from './config';
import { getMirrorAccountById } from './mirror';
import { parseHbarToTinybars } from './payments';

const JOURNAL_PREFIX = 'opago.hedera.pilot-activation.v1.';
const MAX_PILOT_AMOUNT_TINYBARS = 100_000_000n;
const MAX_FEE_TINYBARS = 10_000_000n;

interface PilotFundingSettings {
  payerAccountId: string;
  amountTinybars: bigint;
  maxFeeTinybars: bigint;
  privateKeyHex: string;
}

// Build-time values become part of the installed bundle. Use a small,
// separate pilot account, never the normal Opago treasury account.
export function readPilotFundingSettings(): PilotFundingSettings | null {
  if (process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED !== 'true') return null;
  const payerAccountId = parseHederaAccountId(
    process.env.EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID || '',
    'Pilot funding account ID',
  );
  const privateKeyHex = (process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY || '').trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(privateKeyHex)) throw new Error('Pilot funding key is missing or invalid.');
  const amountTinybars = parseHbarToTinybars(process.env.EXPO_PUBLIC_OPAGO_PILOT_AMOUNT_HBAR || '1', 'Pilot funding amount');
  const maxFeeTinybars = parseHbarToTinybars(process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR || '0.1', 'Pilot funding fee limit');
  if (amountTinybars > MAX_PILOT_AMOUNT_TINYBARS) throw new Error('Pilot funding amount is too large.');
  if (maxFeeTinybars > MAX_FEE_TINYBARS) throw new Error('Pilot funding fee limit is too large.');
  return { payerAccountId, amountTinybars, maxFeeTinybars, privateKeyHex };
}

function parsePilotKey(hex: string, expected: PublicKey): PrivateKey {
  let key: PrivateKey;
  try {
    key = hex.length === 64
      ? expected.type === 'ED25519' ? PrivateKey.fromStringED25519(hex) : PrivateKey.fromStringECDSA(hex)
      : PrivateKey.fromStringDer(hex);
  } catch {
    throw new Error('Pilot funding key has an unsupported format.');
  }
  if (key.type !== expected.type || key.publicKey.toStringRaw() !== expected.toStringRaw()) {
    throw new Error('Pilot funding key does not match its account.');
  }
  return key;
}

function parsePayerPublicKey(type: string | null | undefined, value: string | null | undefined): PublicKey {
  try {
    if (type === 'ED25519') return PublicKey.fromStringED25519(value || '');
    if (type === 'ECDSA_SECP256K1') return PublicKey.fromStringECDSA(value || '');
  } catch { /* Report one fixed error without reflecting key material. */ }
  throw new Error('Pilot funding account key is unsupported.');
}

export async function activateNewPilotWallet(publicKey: string): Promise<void> {
  const settings = readPilotFundingSettings();
  if (!settings) return;
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('Pilot wallet public key is invalid.');
  const targetKey = PublicKey.fromStringED25519(publicKey);
  // A restored or externally funded account must not receive a pilot grant.
  if (await findHederaAccount(targetKey)) return;
  const journalKey = JOURNAL_PREFIX + HEDERA_NETWORK + '.' + publicKey;
  if (await AsyncStorage.getItem(journalKey)) return;

  const payer = await getMirrorAccountById(settings.payerAccountId);
  if (!payer || payer.deleted || payer.account !== settings.payerAccountId) {
    throw new Error('Pilot funding account is unavailable.');
  }
  const expectedKey = parsePayerPublicKey(payer.key?._type, payer.key?.key);
  const privateKey = parsePilotKey(settings.privateKeyHex, expectedKey);
  const balance = payer.balance?.balance;
  if (typeof balance !== 'string' || !/^\d+$/.test(balance) ||
      BigInt(balance) < settings.amountTinybars + settings.maxFeeTinybars) {
    throw new Error('Pilot funding account has insufficient or unknown balance.');
  }

  const client = createHederaClient();
  client.setOperator(AccountId.fromString(settings.payerAccountId), privateKey);
  client.setDefaultMaxTransactionFee(Hbar.fromTinybars(settings.maxFeeTinybars.toString()));
  client.setRequestTimeout(15_000);
  client.setMaxAttempts(2);
  try {
    const transactionId = TransactionId.generate(AccountId.fromString(settings.payerAccountId));
    const transaction = new TransferTransaction()
      .setTransactionId(transactionId)
      .setRegenerateTransactionId(false)
      .addHbarTransfer(settings.payerAccountId, Hbar.fromTinybars((-settings.amountTinybars).toString()))
      .addHbarTransfer(targetKey.toAccountId(0, 0), Hbar.fromTinybars(settings.amountTinybars.toString()))
      .setTransactionMemo('Opago pilot wallet activation')
      .setMaxTransactionFee(Hbar.fromTinybars(settings.maxFeeTinybars.toString()))
      .freezeWith(client);
    const signed = await transaction.sign(privateKey);
    const transactionIdString = transactionId.toString();
    // Save before submission. An uncertain result blocks another automatic payment.
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
