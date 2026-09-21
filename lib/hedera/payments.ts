import {
  AccountId,
  Hbar,
  PrivateKey,
  TransactionId,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import {
  assertHederaNetwork,
  createHederaClient,
  configuredHederaMaxTransferHbar,
  getHederaPaymentFeeCeilingTinybars,
  HEDERA_NETWORK,
  HEDERA_NETWORK_LABEL,
  HEDERA_SDK_GRPC_DEADLINE_MS,
  HEDERA_SDK_MAX_ATTEMPTS,
  HEDERA_SDK_REQUEST_TIMEOUT_MS,
  MAX_HEDERA_DIRECT_TRANSFER_FEE_TINYBARS,
  parseHederaAccountId,
  TINYBARS_PER_HBAR,
} from './config';
import { getHederaTransactionExplorerUrl } from './explorer';
import {
  getMirrorTransaction,
  type MirrorTransactionRecord,
} from './mirror';
import type { HederaPaymentLifecycle } from './payment-journal';

export interface HederaPaymentRequest {
  accountId: string;
  amountTinybars: bigint | null;
  network: typeof HEDERA_NETWORK;
}

export interface HederaTransferResult {
  mode: 'direct' | 'checkout';
  transactionId: string;
  status: 'SUCCESS';
  amountTinybars: bigint;
  amountHbar: string;
  recipientAccountId: string;
  hashscanUrl: string;
  paymentId?: string;
  contractId?: string;
  contractHashscanUrl?: string;
}

export function parseHbarToTinybars(rawAmount: string, label = 'HBAR amount'): bigint {
  const normalized = rawAmount.trim().replace(',', '.');
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) throw new Error(label + ' must use at most 8 decimal places.');
  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] || '').padEnd(8, '0') || '0');
  const tinybars = whole * TINYBARS_PER_HBAR + fractional;
  if (tinybars <= 0n) throw new Error(label + ' must be greater than zero.');
  return tinybars;
}

export function formatTinybars(tinybars: bigint): string {
  const negative = tinybars < 0n;
  const absolute = negative ? -tinybars : tinybars;
  const whole = absolute / TINYBARS_PER_HBAR;
  const fractional = (absolute % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  const formatted = fractional ? whole + '.' + fractional : whole.toString();
  return negative ? '-' + formatted : formatted;
}

export function assertHederaTransferAmount(tinybars: bigint): bigint {
  if (tinybars <= 0n) throw new Error('HBAR amount must be greater than zero.');
  // The SDK serializes transfer amounts as signed int64 tinybars.
  if (tinybars > 9_223_372_036_854_775_807n) {
    throw new Error('HBAR amount exceeds the supported transfer range.');
  }
  if (configuredHederaMaxTransferHbar === 'balance') return tinybars;
  const maximum = parseHbarToTinybars(
    configuredHederaMaxTransferHbar,
    'Configured Hedera transfer limit',
  );
  if (tinybars > maximum) {
    throw new Error(
      'HBAR amount exceeds the configured ' + HEDERA_NETWORK + ' transfer limit of ' +
        configuredHederaMaxTransferHbar +
        ' HBAR.',
    );
  }
  return tinybars;
}

export function parseHederaTransferTinybars(rawAmount: string): bigint {
  return assertHederaTransferAmount(parseHbarToTinybars(rawAmount));
}

// Used both before showing the review and after refreshing the account for signing.
export function assertHederaPaymentBalance(
  amountTinybars: bigint,
  balanceTinybars: bigint,
  mode: 'direct' | 'checkout',
): void {
  assertHederaTransferAmount(amountTinybars);
  if (amountTinybars + getHederaPaymentFeeCeilingTinybars(mode) > balanceTinybars) {
    throw new Error('Insufficient HBAR balance including the maximum transaction fee.');
  }
}

export class HederaPaymentPendingError extends Error {
  readonly transactionId: string;
  readonly hashscanUrl: string;

  constructor(transactionId: string) {
    super(
      'The transaction was prepared but Hedera has not returned an authoritative final status. ' +
        'Transaction ID: ' + transactionId + '. Check Activity or HashScan before retrying.',
    );
    this.name = 'HederaPaymentPendingError';
    this.transactionId = transactionId;
    this.hashscanUrl = getHederaTransactionExplorerUrl(transactionId);
  }
}

type MirrorTransactionLoader = (
  transactionId: string,
) => Promise<MirrorTransactionRecord | null>;

async function recordResolutionBestEffort(
  lifecycle: HederaPaymentLifecycle | undefined,
  transactionId: string,
  state: 'confirmed' | 'failed',
  result: string,
): Promise<void> {
  try {
    await lifecycle?.onResolved?.({ transactionId, state, result });
  } catch {
    // An authoritative network result must not be hidden by local journal storage failure.
  }
}

export async function reconcileAmbiguousHederaSubmission(input: {
  transactionId: string;
  lifecycle?: HederaPaymentLifecycle;
  loadTransaction?: MirrorTransactionLoader;
  sleep?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
}): Promise<'SUCCESS'> {
  const loadTransaction = input.loadTransaction || getMirrorTransaction;
  const sleep = input.sleep || (delayMs => new Promise<void>(resolve => setTimeout(resolve, delayMs)));
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error('Hedera reconciliation attempts must be between 1 and 5.');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) await sleep((attempt - 1) * 1_000);
    let transaction: MirrorTransactionRecord | null = null;
    try {
      transaction = await loadTransaction(input.transactionId);
    } catch {
      // The durable pending journal remains authoritative until Mirror Node is reachable.
    }
    const result = String(transaction?.result || '').trim().toUpperCase();
    if (!result || result === 'UNKNOWN') continue;
    if (result === 'SUCCESS') {
      await recordResolutionBestEffort(
        input.lifecycle,
        input.transactionId,
        'confirmed',
        result,
      );
      return 'SUCCESS';
    }
    await recordResolutionBestEffort(
      input.lifecycle,
      input.transactionId,
      'failed',
      result,
    );
    throw new Error(HEDERA_NETWORK_LABEL + ' returned status ' + result + '.');
  }
  throw new HederaPaymentPendingError(input.transactionId);
}

// Backward-compatible names for the existing testnet acceptance scripts.
export const assertHederaTestTransferAmount = assertHederaTransferAmount;
export const parseHederaTestTransferTinybars = parseHederaTransferTinybars;

export function buildHederaReceiveRequest(
  rawAccountId: string,
  amountTinybars: bigint | null = null,
): string {
  const accountId = parseHederaAccountId(rawAccountId);
  const params = new URLSearchParams({ network: HEDERA_NETWORK });
  if (amountTinybars !== null) {
    params.set('amount', formatTinybars(assertHederaTransferAmount(amountTinybars)));
  }
  return 'hedera:' + accountId + '?' + params.toString();
}

export function buildHederaWalletQrValue(rawAccountId: string): string {
  // Third-party Hedera wallets such as HashPack expect a plain numeric account
  // ID in their recipient scanner. Keep the richer Opago request URI separate
  // so an optional requested amount can still be tracked inside Opago.
  return parseHederaAccountId(rawAccountId);
}

export function parseHederaPaymentRequest(rawRequest: string): HederaPaymentRequest {
  const normalized = rawRequest.trim();
  if (/^0\.0\.[1-9]\d*$/.test(normalized)) {
    return {
      accountId: parseHederaAccountId(normalized),
      amountTinybars: null,
      network: HEDERA_NETWORK,
    };
  }

  const match = /^hedera:(0\.0\.[1-9]\d*)(?:\?([^#]*))?$/i.exec(normalized);
  if (!match) {
    throw new Error('Enter a numeric Hedera account ID or scan a Hedera payment QR.');
  }
  const params = new URLSearchParams(match[2] || '');
  for (const key of params.keys()) {
    if (key !== 'network' && key !== 'amount') {
      throw new Error('Hedera payment request contains an unsupported parameter.');
    }
    if (params.getAll(key).length !== 1) {
      throw new Error('Hedera payment request contains a duplicate parameter.');
    }
  }
  const network = params.get('network');
  if (network && network.toLowerCase() !== HEDERA_NETWORK) {
    throw new Error('Only Hedera ' + HEDERA_NETWORK + ' payment requests are accepted.');
  }
  const amount = params.get('amount');
  return {
    accountId: parseHederaAccountId(match[1]),
    amountTinybars: amount ? parseHederaTransferTinybars(amount) : null,
    network: HEDERA_NETWORK,
  };
}

export async function sendHederaTransfer(input: {
  sourceAccountId: string;
  recipientAccountId: string;
  amountTinybars: bigint;
  privateKey: PrivateKey;
  lifecycle?: HederaPaymentLifecycle;
  assertAuthorized?: () => void;
}): Promise<HederaTransferResult> {
  assertHederaNetwork();
  const sourceAccountId = parseHederaAccountId(input.sourceAccountId, 'Source account ID');
  const recipientAccountId = parseHederaAccountId(
    input.recipientAccountId,
    'Recipient account ID',
  );
  if (sourceAccountId === recipientAccountId) {
    throw new Error('Source and recipient Hedera accounts must be different.');
  }
  const tinybars = assertHederaTransferAmount(input.amountTinybars);
  const client = createHederaClient();
  client.setOperator(sourceAccountId, input.privateKey);
  client.setDefaultMaxTransactionFee(
    Hbar.fromTinybars(MAX_HEDERA_DIRECT_TRANSFER_FEE_TINYBARS.toString()),
  );
  client.setGrpcDeadline(HEDERA_SDK_GRPC_DEADLINE_MS);
  client.setRequestTimeout(HEDERA_SDK_REQUEST_TIMEOUT_MS);
  client.setMaxAttempts(HEDERA_SDK_MAX_ATTEMPTS);

  try {
    const transactionId = TransactionId.generate(AccountId.fromString(sourceAccountId));
    const transactionIdString = transactionId.toString();
    const transaction = new TransferTransaction()
      .setTransactionId(transactionId)
      .addHbarTransfer(sourceAccountId, Hbar.fromTinybars((-tinybars).toString()))
      .addHbarTransfer(recipientAccountId, Hbar.fromTinybars(tinybars.toString()))
      .setTransactionMemo('Opago HBAR ' + HEDERA_NETWORK + ' transfer')
      .setMaxTransactionFee(
        Hbar.fromTinybars(MAX_HEDERA_DIRECT_TRANSFER_FEE_TINYBARS.toString()),
      );
    await input.lifecycle?.onSubmitted?.({
      transactionId: transactionIdString,
      mode: 'direct',
      recipientAccountId,
      amountTinybars: tinybars,
    });
    try {
      input.assertAuthorized?.();
    } catch (cause) {
      await input.lifecycle?.onResolved?.({ transactionId: transactionIdString, state: 'failed', result: 'CANCELLED_BEFORE_SUBMISSION' });
      throw cause;
    }
    let response;
    try {
      response = await transaction.execute(client);
    } catch {
      await reconcileAmbiguousHederaSubmission({
        transactionId: transactionIdString,
        lifecycle: input.lifecycle,
      });
      return buildDirectTransferResult(transactionIdString, recipientAccountId, tinybars);
    }
    let status: string;
    try {
      const receipt = await response
        .getReceiptQuery(client)
        .setValidateStatus(false)
        .execute(client);
      status = receipt.status.toString();
    } catch {
      await reconcileAmbiguousHederaSubmission({
        transactionId: transactionIdString,
        lifecycle: input.lifecycle,
      });
      return buildDirectTransferResult(transactionIdString, recipientAccountId, tinybars);
    }
    if (status === 'UNKNOWN') {
      await reconcileAmbiguousHederaSubmission({
        transactionId: transactionIdString,
        lifecycle: input.lifecycle,
      });
      return buildDirectTransferResult(transactionIdString, recipientAccountId, tinybars);
    }
    if (status !== 'SUCCESS') {
      await recordResolutionBestEffort(input.lifecycle, transactionIdString, 'failed', status);
      throw new Error(HEDERA_NETWORK_LABEL + ' returned status ' + status + '.');
    }
    await recordResolutionBestEffort(input.lifecycle, transactionIdString, 'confirmed', status);
    return buildDirectTransferResult(transactionIdString, recipientAccountId, tinybars);
  } finally {
    client.close();
  }
}

function buildDirectTransferResult(
  transactionId: string,
  recipientAccountId: string,
  amountTinybars: bigint,
): HederaTransferResult {
  return {
    mode: 'direct',
    transactionId,
    status: 'SUCCESS',
    amountTinybars,
    amountHbar: formatTinybars(amountTinybars),
    recipientAccountId,
    hashscanUrl: getHederaTransactionExplorerUrl(transactionId),
  };
}

// Kept until external integrations have migrated to the network-neutral API.
export const sendHederaTestnetTransfer = sendHederaTransfer;
