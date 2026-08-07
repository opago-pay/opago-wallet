import {
  Client,
  Hbar,
  PrivateKey,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import {
  assertHederaTestnet,
  configuredHederaMaxTransferHbar,
  MAX_HEDERA_TRANSACTION_FEE_TINYBARS,
  parseHederaAccountId,
  TINYBARS_PER_HBAR,
} from './config';
import { getHederaTransactionExplorerUrl } from './explorer';

export interface HederaPaymentRequest {
  accountId: string;
  amountTinybars: bigint | null;
  network: 'testnet';
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

export function assertHederaTestTransferAmount(tinybars: bigint): bigint {
  if (tinybars <= 0n) throw new Error('HBAR amount must be greater than zero.');
  const maximum = parseHbarToTinybars(
    configuredHederaMaxTransferHbar,
    'Configured Hedera test-transfer limit',
  );
  if (tinybars > maximum) {
    throw new Error(
      'HBAR amount exceeds the test-transfer limit of ' +
        configuredHederaMaxTransferHbar +
        ' HBAR.',
    );
  }
  return tinybars;
}

export function parseHederaTestTransferTinybars(rawAmount: string): bigint {
  return assertHederaTestTransferAmount(parseHbarToTinybars(rawAmount));
}

export function buildHederaReceiveRequest(
  rawAccountId: string,
  amountTinybars: bigint | null = null,
): string {
  const accountId = parseHederaAccountId(rawAccountId);
  const params = new URLSearchParams({ network: 'testnet' });
  if (amountTinybars !== null) {
    params.set('amount', formatTinybars(assertHederaTestTransferAmount(amountTinybars)));
  }
  return 'hedera:' + accountId + '?' + params.toString();
}

export function parseHederaPaymentRequest(rawRequest: string): HederaPaymentRequest {
  const normalized = rawRequest.trim();
  if (/^0\.0\.[1-9]\d*$/.test(normalized)) {
    return {
      accountId: parseHederaAccountId(normalized),
      amountTinybars: null,
      network: 'testnet',
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
  if (network && network.toLowerCase() !== 'testnet') {
    throw new Error('Only Hedera testnet payment requests are accepted.');
  }
  const amount = params.get('amount');
  return {
    accountId: parseHederaAccountId(match[1]),
    amountTinybars: amount ? parseHederaTestTransferTinybars(amount) : null,
    network: 'testnet',
  };
}

export async function sendHederaTestnetTransfer(input: {
  sourceAccountId: string;
  recipientAccountId: string;
  amountTinybars: bigint;
  privateKey: PrivateKey;
}): Promise<HederaTransferResult> {
  assertHederaTestnet();
  const sourceAccountId = parseHederaAccountId(input.sourceAccountId, 'Source account ID');
  const recipientAccountId = parseHederaAccountId(
    input.recipientAccountId,
    'Recipient account ID',
  );
  if (sourceAccountId === recipientAccountId) {
    throw new Error('Source and recipient Hedera accounts must be different.');
  }
  const tinybars = assertHederaTestTransferAmount(input.amountTinybars);
  const client = Client.forTestnet();
  client.setOperator(sourceAccountId, input.privateKey);
  client.setDefaultMaxTransactionFee(
    Hbar.fromTinybars(MAX_HEDERA_TRANSACTION_FEE_TINYBARS.toString()),
  );

  try {
    const response = await new TransferTransaction()
      .addHbarTransfer(sourceAccountId, Hbar.fromTinybars((-tinybars).toString()))
      .addHbarTransfer(recipientAccountId, Hbar.fromTinybars(tinybars.toString()))
      .setTransactionMemo('Opago Phase 2 HBAR testnet transfer')
      .setMaxTransactionFee(
        Hbar.fromTinybars(MAX_HEDERA_TRANSACTION_FEE_TINYBARS.toString()),
      )
      .execute(client);
    const receipt = await response.getReceipt(client);
    const status = receipt.status.toString();
    if (status !== 'SUCCESS') {
      throw new Error('Hedera testnet returned status ' + status + '.');
    }
    const transactionId = response.transactionId.toString();
    return {
      mode: 'direct',
      transactionId,
      status: 'SUCCESS',
      amountTinybars: tinybars,
      amountHbar: formatTinybars(tinybars),
      recipientAccountId,
      hashscanUrl: getHederaTransactionExplorerUrl(transactionId),
    };
  } finally {
    client.close();
  }
}
