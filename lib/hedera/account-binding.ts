import type { HederaNetwork } from '../config';
import { parseHederaAccountId } from './config';
import {
  HEDERA_KEY_ALGORITHM,
  HEDERA_KEY_DERIVATION_VERSION,
  normalizeHederaPublicKey,
} from './keys';

export const HEDERA_ACCOUNT_BINDING_SCHEMA_VERSION = 1 as const;

export interface HederaAccountBinding {
  schemaVersion: typeof HEDERA_ACCOUNT_BINDING_SCHEMA_VERSION;
  network: HederaNetwork;
  derivationVersion: typeof HEDERA_KEY_DERIVATION_VERSION;
  algorithm: typeof HEDERA_KEY_ALGORITHM;
  publicKey: string;
  accountId: string;
}

export function getHederaAccountBindingStorageKey(network: HederaNetwork): string {
  return 'opago.hedera.account-binding.v1.' + network;
}

export function createHederaAccountBinding(input: {
  network: HederaNetwork;
  publicKey: string;
  accountId: string;
}): HederaAccountBinding {
  return Object.freeze({
    schemaVersion: HEDERA_ACCOUNT_BINDING_SCHEMA_VERSION,
    network: input.network,
    derivationVersion: HEDERA_KEY_DERIVATION_VERSION,
    algorithm: HEDERA_KEY_ALGORITHM,
    publicKey: normalizeHederaPublicKey(input.publicKey),
    accountId: parseHederaAccountId(input.accountId),
  });
}

export function serializeHederaAccountBinding(binding: HederaAccountBinding): string {
  return JSON.stringify(binding);
}

export function parseHederaAccountBinding(
  rawBinding: string,
  expectedNetwork: HederaNetwork,
  expectedPublicKey: string,
): HederaAccountBinding {
  let candidate: unknown;
  try {
    candidate = JSON.parse(rawBinding);
  } catch {
    throw new Error('Stored Hedera account binding is not valid JSON.');
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Stored Hedera account binding is invalid.');
  }
  const value = candidate as Record<string, unknown>;
  const expectedFields = [
    'accountId',
    'algorithm',
    'derivationVersion',
    'network',
    'publicKey',
    'schemaVersion',
  ];
  if (
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedFields) ||
    value.schemaVersion !== HEDERA_ACCOUNT_BINDING_SCHEMA_VERSION ||
    value.network !== expectedNetwork ||
    value.derivationVersion !== HEDERA_KEY_DERIVATION_VERSION ||
    value.algorithm !== HEDERA_KEY_ALGORITHM ||
    typeof value.publicKey !== 'string' ||
    typeof value.accountId !== 'string'
  ) {
    throw new Error('Stored Hedera account binding does not match this wallet build.');
  }
  const expectedKey = normalizeHederaPublicKey(expectedPublicKey);
  const binding = createHederaAccountBinding({
    network: expectedNetwork,
    publicKey: value.publicKey,
    accountId: value.accountId,
  });
  if (binding.publicKey !== expectedKey) {
    throw new Error('Stored Hedera account binding belongs to another wallet key.');
  }
  return binding;
}
