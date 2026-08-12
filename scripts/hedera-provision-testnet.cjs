'use strict';

const {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
} = require('@hiero-ledger/sdk');

const MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com';
const HASHSCAN_URL = 'https://hashscan.io/testnet';
const TINYBARS_PER_HBAR = 100_000_000n;
const MAX_INITIAL_BALANCE_HBAR = 100n;

function rejectBundledSecrets() {
  const unsafeNames = Object.keys(process.env).filter(
    name =>
      name.startsWith('EXPO_PUBLIC_') &&
      /(OPERATOR|FAUCET|PRIVATE.*KEY)/i.test(name),
  );
  if (unsafeNames.length) {
    throw new Error(
      'Refusing to run while operator/faucet/private-key material is exposed through EXPO_PUBLIC_*: ' +
        unsafeNames.join(', '),
    );
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function normalizePublicKey(value) {
  try {
    const publicKey = PublicKey.fromString(value.trim());
    if (publicKey.type !== 'ED25519') throw new Error('wrong key type');
    return {
      publicKey,
      raw: publicKey.toStringRaw().toLowerCase(),
    };
  } catch {
    throw new Error('HEDERA_WALLET_PUBLIC_KEY must be a valid Ed25519 public key.');
  }
}

function parseOperatorKey(value) {
  const normalized = value.trim();
  const hasMetaMaskPrefix = normalized.toLowerCase().startsWith('0x');
  const hex = hasMetaMaskPrefix ? normalized.slice(2) : normalized;
  if (!/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('HEDERA_OPERATOR_KEY must be hexadecimal.');
  }

  if (hasMetaMaskPrefix && hex.length === 64) {
    try {
      return PrivateKey.fromStringECDSA(hex);
    } catch {
      throw new Error('HEDERA_OPERATOR_KEY is not a valid MetaMask ECDSA private key.');
    }
  }

  if (hex.length === 64) {
    const keyType = (process.env.HEDERA_OPERATOR_KEY_TYPE || '').trim().toUpperCase();
    if (keyType === 'ECDSA') return PrivateKey.fromStringECDSA(hex);
    if (keyType === 'ED25519') return PrivateKey.fromStringED25519(hex);
    throw new Error(
      'A raw operator key is ambiguous. Set HEDERA_OPERATOR_KEY_TYPE to ECDSA or ED25519.',
    );
  }

  try {
    return PrivateKey.fromStringDer(hex);
  } catch {
    throw new Error('HEDERA_OPERATOR_KEY is not a supported Hedera DER private key.');
  }
}

function parsePositiveHbar(value, label, maximumWholeHbar) {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(normalized);
  if (!match) throw new Error(label + ' must use at most 8 decimal places.');
  const tinybars =
    BigInt(match[1]) * TINYBARS_PER_HBAR +
    BigInt((match[2] || '').padEnd(8, '0') || '0');
  if (tinybars <= 0n) throw new Error(label + ' must be greater than zero.');
  if (tinybars > maximumWholeHbar * TINYBARS_PER_HBAR) {
    throw new Error(label + ' may not exceed ' + maximumWholeHbar + ' HBAR.');
  }
  return tinybars;
}

function normalizeMirrorKey(value) {
  try {
    return PublicKey.fromString(value).toStringRaw().toLowerCase();
  } catch {
    return null;
  }
}

function assertOperatorKeyMatchesAccount(operatorKey, mirrorAccount) {
  const expected = normalizeMirrorKey(mirrorAccount?.key?.key || '');
  const actual = operatorKey.publicKey.toStringRaw().toLowerCase();
  if (!expected) {
    throw new Error('Mirror Node did not return a supported public key for the operator account.');
  }
  if (actual !== expected) {
    throw new Error(
      'HEDERA_OPERATOR_KEY does not match HEDERA_OPERATOR_ID. No transaction was submitted.',
    );
  }
}

async function loadAccount(accountId) {
  const response = await fetch(
    MIRROR_NODE_URL + '/api/v1/accounts/' + encodeURIComponent(accountId),
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error('Mirror Node operator lookup failed with HTTP ' + response.status + '.');
  }
  const account = await response.json();
  if (account.deleted) throw new Error('The Hedera operator account is deleted.');
  return account;
}

function formatTinybars(value) {
  const tinybars = BigInt(value);
  const whole = tinybars / TINYBARS_PER_HBAR;
  const fraction = (tinybars % TINYBARS_PER_HBAR)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole.toString();
}

async function findAccount(publicKeyRaw) {
  const url = new URL('/api/v1/accounts', MIRROR_NODE_URL);
  url.searchParams.set('account.publickey', publicKeyRaw);
  url.searchParams.set('balance', 'true');
  url.searchParams.set('limit', '100');
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error('Mirror Node account lookup failed with HTTP ' + response.status + '.');
  }
  const body = await response.json();
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  const matches = accounts.filter(
    account =>
      !account.deleted &&
      typeof account.account === 'string' &&
      normalizeMirrorKey(account.key?.key || '') === publicKeyRaw,
  );
  if (matches.length > 1) {
    throw new Error('More than one testnet account uses this public key.');
  }
  return matches[0] || null;
}

function printAccount(label, accountId, publicKeyRaw, balanceTinybars) {
  console.log(label);
  console.log('  network: testnet');
  console.log('  account: ' + accountId);
  console.log('  public key: ' + publicKeyRaw);
  if (balanceTinybars != null) {
    console.log('  balance: ' + formatTinybars(String(balanceTinybars)) + ' HBAR');
  }
  console.log('  explorer: ' + HASHSCAN_URL + '/account/' + accountId);
}

async function main() {
  rejectBundledSecrets();
  const { publicKey, raw: publicKeyRaw } = normalizePublicKey(
    requiredEnvironment('HEDERA_WALLET_PUBLIC_KEY'),
  );
  const existing = await findAccount(publicKeyRaw);
  if (existing) {
    printAccount(
      'Existing Hedera testnet account found.',
      existing.account,
      publicKeyRaw,
      existing.balance?.balance ?? 0,
    );
    return;
  }

  const operatorIdValue = requiredEnvironment('HEDERA_OPERATOR_ID');
  if (!/^0\.0\.[1-9]\d*$/.test(operatorIdValue)) {
    throw new Error('HEDERA_OPERATOR_ID must use numeric 0.0.x format.');
  }
  const operatorId = AccountId.fromString(operatorIdValue);
  const operatorKey = parseOperatorKey(requiredEnvironment('HEDERA_OPERATOR_KEY'));
  assertOperatorKeyMatchesAccount(operatorKey, await loadAccount(operatorIdValue));
  const initialTinybars = parsePositiveHbar(
    process.env.HEDERA_INITIAL_BALANCE_HBAR || '2',
    'HEDERA_INITIAL_BALANCE_HBAR',
    MAX_INITIAL_BALANCE_HBAR,
  );
  const client = Client.forTestnet().setOperator(operatorId, operatorKey);
  client.setDefaultMaxTransactionFee(Hbar.fromTinybars('200000000'));

  try {
    const response = await new AccountCreateTransaction()
      .setKeyWithoutAlias(publicKey)
      .setInitialBalance(Hbar.fromTinybars(initialTinybars.toString()))
      .setMaxAutomaticTokenAssociations(0)
      .setMaxTransactionFee(Hbar.fromTinybars('200000000'))
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== 'SUCCESS' || !receipt.accountId) {
      throw new Error('Account creation returned status ' + receipt.status.toString() + '.');
    }
    printAccount(
      'Created Hedera testnet account.',
      receipt.accountId.toString(),
      publicKeyRaw,
      initialTinybars,
    );
  } finally {
    client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(
      'Hedera testnet provisioning failed: ' +
        (error instanceof Error ? error.message : 'unknown error'),
    );
    process.exitCode = 1;
  });
}

module.exports = {
  assertOperatorKeyMatchesAccount,
  parseOperatorKey,
};
