import {
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  Hbar,
  Long,
  type PrivateKey,
} from '@hiero-ledger/sdk';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { appConfig } from '../config';
import {
  assertHederaTestnet,
  HEDERA_SDK_GRPC_DEADLINE_MS,
  HEDERA_SDK_MAX_ATTEMPTS,
  HEDERA_SDK_REQUEST_TIMEOUT_MS,
  MAX_HEDERA_TRANSACTION_FEE_TINYBARS,
  parseHederaAccountId,
} from './config';
import {
  getHederaContractExplorerUrl,
  getHederaTransactionExplorerUrl,
} from './explorer';
import {
  getMirrorAccountById,
  getMirrorContractById,
} from './mirror';
import {
  assertHederaTestTransferAmount,
  formatTinybars,
  parseHbarToTinybars,
  type HederaTransferResult,
} from './payments';
import type { HederaPaymentLifecycle } from './payment-journal';

const CHECKOUT_HOST = 'hedera-checkout';
const EVM_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
const CONTRACT_ID_PATTERN = /^0\.0\.[1-9]\d*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PAYMENT_DOMAIN = hexToBytes(
  '2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c',
  'Checkout domain',
);
const HEDERA_TESTNET_CHAIN_ID = 296n;
const REQUIRED_PARAMETERS = [
  'network',
  'contractId',
  'merchant',
  'merchantEvmAddress',
  'amount',
  'paymentId',
  'requestNonce',
  'expiresAt',
] as const;

export const MAX_CHECKOUT_LIFETIME_SECONDS = 30 * 60;
export const MIN_CHECKOUT_REMAINING_SECONDS = 10;

export interface HederaCheckoutRequest {
  kind: 'checkout';
  network: 'testnet';
  contractId: string;
  merchantAccountId: string;
  merchantEvmAddress: string;
  amountTinybars: bigint;
  amountHbar: string;
  paymentId: string;
  requestNonce: string;
  expiresAt: number;
}

function configuredContractId(): string {
  const value = appConfig.hederaCheckoutContractId.trim();
  if (!CONTRACT_ID_PATTERN.test(value)) {
    throw new Error(
      'Hedera checkout is not configured. Set a verified testnet contract ID at build time.',
    );
  }
  return value;
}

function configuredRuntimeSha256(): string {
  const value = appConfig.hederaCheckoutRuntimeSha256.trim().toLowerCase().replace(/^0x/, '');
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(
      'Hedera checkout is not configured with a pinned runtime bytecode hash.',
    );
  }
  return value;
}

function requiredParameter(url: URL, name: string): string {
  const values = url.searchParams.getAll(name);
  if (values.length !== 1 || !values[0]) {
    throw new Error('Hedera checkout request has a missing or duplicate ' + name + '.');
  }
  return values[0];
}

function hexToBytes(rawValue: string, label: string): Uint8Array {
  const value = rawValue.toLowerCase().replace(/^0x/, '');
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(label + ' is not valid hexadecimal data.');
  }
  return Uint8Array.from(value.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)));
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function unsignedBytes(value: bigint, length: number, label: string): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(length * 8)) {
    throw new Error(label + ' is outside its unsigned integer range.');
  }
  return hexToBytes(value.toString(16).padStart(length * 2, '0'), label);
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function contractIdToEvmAddress(contractId: string): string {
  if (!CONTRACT_ID_PATTERN.test(contractId)) {
    throw new Error('Hedera checkout contract ID is invalid.');
  }
  const number = BigInt(contractId.split('.')[2]);
  if (number >= 1n << 64n) {
    throw new Error('Hedera checkout contract number is outside the uint64 range.');
  }
  return '0x' + number.toString(16).padStart(40, '0');
}

export function computeHederaCheckoutPaymentId(input: {
  contractId: string;
  merchantEvmAddress: string;
  amountTinybars: bigint;
  requestNonce: string;
  expiresAt: number;
}): string {
  const merchant = input.merchantEvmAddress.toLowerCase();
  const nonce = input.requestNonce.toLowerCase();
  if (!EVM_ADDRESS_PATTERN.test(merchant)) {
    throw new Error('Merchant EVM address is invalid.');
  }
  if (!BYTES32_PATTERN.test(nonce) || nonce === '0x' + '0'.repeat(64)) {
    throw new Error('Checkout request nonce is invalid.');
  }
  if (input.amountTinybars <= 0n) throw new Error('Checkout amount is invalid.');
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) {
    throw new Error('Checkout expiry is invalid.');
  }

  const packed = concatenate([
    PAYMENT_DOMAIN,
    unsignedBytes(HEDERA_TESTNET_CHAIN_ID, 32, 'Hedera chain ID'),
    hexToBytes(contractIdToEvmAddress(input.contractId), 'Checkout contract address'),
    hexToBytes(nonce, 'Checkout request nonce'),
    hexToBytes(merchant, 'Merchant EVM address'),
    unsignedBytes(input.amountTinybars, 32, 'Checkout amount'),
    unsignedBytes(BigInt(input.expiresAt), 8, 'Checkout expiry'),
  ]);
  return '0x' + bytesToHex(keccak_256(packed));
}

export function parseHederaCheckoutRequest(
  rawRequest: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): HederaCheckoutRequest | null {
  const value = rawRequest.trim();
  if (!/^opagowallet:\/\/hedera-checkout(?:[/?]|$)/i.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Hedera checkout request is not a valid URL.');
  }
  if (
    url.protocol !== 'opagowallet:' ||
    url.hostname !== CHECKOUT_HOST ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.hash ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Hedera checkout request target is invalid.');
  }
  for (const key of url.searchParams.keys()) {
    if (!(REQUIRED_PARAMETERS as readonly string[]).includes(key)) {
      throw new Error('Hedera checkout request contains an unsupported parameter.');
    }
  }

  if (requiredParameter(url, 'network').toLowerCase() !== 'testnet') {
    throw new Error('Only Hedera testnet checkout requests are accepted.');
  }
  const contractId = requiredParameter(url, 'contractId');
  if (!CONTRACT_ID_PATTERN.test(contractId) || contractId !== configuredContractId()) {
    throw new Error('Checkout contract does not match the configured Hedera testnet contract.');
  }
  const merchantAccountId = parseHederaAccountId(
    requiredParameter(url, 'merchant'),
    'Merchant account ID',
  );
  const merchantEvmAddress = requiredParameter(url, 'merchantEvmAddress').toLowerCase();
  if (
    !EVM_ADDRESS_PATTERN.test(merchantEvmAddress) ||
    merchantEvmAddress === '0x' + '0'.repeat(40)
  ) {
    throw new Error('Merchant EVM address is invalid.');
  }
  const paymentId = requiredParameter(url, 'paymentId').toLowerCase();
  if (!BYTES32_PATTERN.test(paymentId) || paymentId === '0x' + '0'.repeat(64)) {
    throw new Error('Checkout payment ID is invalid.');
  }
  const requestNonce = requiredParameter(url, 'requestNonce').toLowerCase();
  if (!BYTES32_PATTERN.test(requestNonce) || requestNonce === '0x' + '0'.repeat(64)) {
    throw new Error('Checkout request nonce is invalid.');
  }
  const amountTinybars = assertHederaTestTransferAmount(
    parseHbarToTinybars(requiredParameter(url, 'amount')),
  );
  const expiresRaw = requiredParameter(url, 'expiresAt');
  if (!/^\d{10}$/.test(expiresRaw)) {
    throw new Error('Checkout expiry is invalid.');
  }
  const expiresAt = Number(expiresRaw);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < nowSeconds + MIN_CHECKOUT_REMAINING_SECONDS
  ) {
    throw new Error('Hedera checkout request is expired or too close to expiry.');
  }
  if (expiresAt > nowSeconds + MAX_CHECKOUT_LIFETIME_SECONDS) {
    throw new Error('Hedera checkout request expiry is too far in the future.');
  }
  const expectedPaymentId = computeHederaCheckoutPaymentId({
    contractId,
    merchantEvmAddress,
    amountTinybars,
    requestNonce,
    expiresAt,
  });
  if (paymentId !== expectedPaymentId) {
    throw new Error('Checkout payment ID does not match the bound request fields.');
  }

  return {
    kind: 'checkout',
    network: 'testnet',
    contractId,
    merchantAccountId,
    merchantEvmAddress,
    amountTinybars,
    amountHbar: formatTinybars(amountTinybars),
    paymentId,
    requestNonce,
    expiresAt,
  };
}

export async function verifyHederaCheckoutRequest(
  request: HederaCheckoutRequest,
): Promise<void> {
  assertHederaTestnet();
  parseHederaCheckoutRequest(buildHederaCheckoutRequest(request));
  const [merchant, contract] = await Promise.all([
    getMirrorAccountById(request.merchantAccountId),
    getMirrorContractById(request.contractId),
  ]);
  if (
    !merchant ||
    merchant.deleted ||
    merchant.account !== request.merchantAccountId ||
    merchant.evm_address?.toLowerCase().replace(/^0x/, '') !==
      request.merchantEvmAddress.slice(2)
  ) {
    throw new Error('Merchant account and EVM address do not match Hedera testnet.');
  }
  if (
    !contract ||
    contract.deleted ||
    contract.contract_id !== request.contractId ||
    contract.evm_address?.toLowerCase().replace(/^0x/, '') !==
      contractIdToEvmAddress(request.contractId).slice(2) ||
    !contract.runtime_bytecode ||
    contract.runtime_bytecode === '0x'
  ) {
    throw new Error('Configured checkout contract is not active on Hedera testnet.');
  }
  const runtimeHash = bytesToHex(
    sha256(hexToBytes(contract.runtime_bytecode, 'Mirror Node runtime bytecode')),
  );
  if (runtimeHash !== configuredRuntimeSha256()) {
    throw new Error('Checkout contract runtime bytecode does not match the pinned build.');
  }
}

export function buildHederaCheckoutRequest(request: HederaCheckoutRequest): string {
  const params = new URLSearchParams({
    network: 'testnet',
    contractId: request.contractId,
    merchant: request.merchantAccountId,
    merchantEvmAddress: request.merchantEvmAddress,
    amount: formatTinybars(request.amountTinybars),
    paymentId: request.paymentId,
    requestNonce: request.requestNonce,
    expiresAt: String(request.expiresAt),
  });
  return 'opagowallet://' + CHECKOUT_HOST + '?' + params.toString();
}

function bytes32(value: string, label: string): Uint8Array {
  if (!BYTES32_PATTERN.test(value.toLowerCase())) throw new Error(label + ' is invalid.');
  return hexToBytes(value, label);
}

export function buildHederaCheckoutTransaction(
  request: HederaCheckoutRequest,
): ContractExecuteTransaction {
  parseHederaCheckoutRequest(buildHederaCheckoutRequest(request));
  const amountTinybars = assertHederaTestTransferAmount(request.amountTinybars);
  const parameters = new ContractFunctionParameters()
    .addBytes32(bytes32(request.paymentId, 'Checkout payment ID'))
    .addBytes32(bytes32(request.requestNonce, 'Checkout request nonce'))
    .addAddress(request.merchantEvmAddress)
    .addUint256(Long.fromString(amountTinybars.toString(), true))
    .addUint64(Long.fromString(String(request.expiresAt), true));
  return new ContractExecuteTransaction()
    .setContractId(request.contractId)
    .setGas(300_000)
    .setPayableAmount(Hbar.fromTinybars(amountTinybars.toString()))
    .setFunction('pay', parameters)
    .setTransactionMemo('Opago Phase 3 HBAR checkout')
    .setMaxTransactionFee(
      Hbar.fromTinybars(MAX_HEDERA_TRANSACTION_FEE_TINYBARS.toString()),
    );
}

export async function sendHederaCheckoutPayment(input: {
  sourceAccountId: string;
  request: HederaCheckoutRequest;
  privateKey: PrivateKey;
  lifecycle?: HederaPaymentLifecycle;
}): Promise<HederaTransferResult> {
  await verifyHederaCheckoutRequest(input.request);
  const sourceAccountId = parseHederaAccountId(input.sourceAccountId, 'Source account ID');
  if (sourceAccountId === input.request.merchantAccountId) {
    throw new Error('Source and merchant Hedera accounts must be different.');
  }
  const amountTinybars = assertHederaTestTransferAmount(input.request.amountTinybars);
  const client = Client.forTestnet();
  client.setOperator(sourceAccountId, input.privateKey);
  client.setDefaultMaxTransactionFee(
    Hbar.fromTinybars(MAX_HEDERA_TRANSACTION_FEE_TINYBARS.toString()),
  );
  client.setGrpcDeadline(HEDERA_SDK_GRPC_DEADLINE_MS);
  client.setRequestTimeout(HEDERA_SDK_REQUEST_TIMEOUT_MS);
  client.setMaxAttempts(HEDERA_SDK_MAX_ATTEMPTS);

  try {
    const response = await buildHederaCheckoutTransaction(input.request).execute(client);
    const transactionId = response.transactionId.toString();
    await input.lifecycle?.onSubmitted?.({
      transactionId,
      mode: 'checkout',
      recipientAccountId: input.request.merchantAccountId,
      amountTinybars,
      paymentId: input.request.paymentId,
    });
    const receipt = await response
      .getReceiptQuery(client)
      .setValidateStatus(false)
      .execute(client);
    const status = receipt.status.toString();
    if (status !== 'SUCCESS') {
      await input.lifecycle?.onResolved?.({
        transactionId,
        state: 'failed',
        result: status,
      });
      throw new Error('Hedera checkout returned status ' + status + '.');
    }
    await input.lifecycle?.onResolved?.({
      transactionId,
      state: 'confirmed',
      result: status,
    });
    return {
      mode: 'checkout',
      transactionId,
      status: 'SUCCESS',
      amountTinybars,
      amountHbar: formatTinybars(amountTinybars),
      recipientAccountId: input.request.merchantAccountId,
      hashscanUrl: getHederaTransactionExplorerUrl(transactionId),
      paymentId: input.request.paymentId,
      contractId: input.request.contractId,
      contractHashscanUrl: getHederaContractExplorerUrl(input.request.contractId),
    };
  } finally {
    client.close();
  }
}
