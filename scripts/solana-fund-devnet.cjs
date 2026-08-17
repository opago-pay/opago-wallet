'use strict';

const { Connection, PublicKey } = require('@solana/web3.js');

const DEVNET_RPC_URL = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const LAMPORTS_PER_SOL = 1_000_000_000n;
const MAX_AIRDROP_LAMPORTS = 2n * LAMPORTS_PER_SOL;
const CONFIRMATION_TIMEOUT_MS = 60_000;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required.');
  return value;
}

function parseAddress(value) {
  try {
    const address = new PublicKey(value);
    if (address.equals(PublicKey.default)) throw new Error('system program');
    return address;
  } catch {
    throw new Error('SOLANA_WALLET_ADDRESS must be a valid wallet address.');
  }
}

function parseAirdropAmount(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) throw new Error('SOLANA_DEVNET_AIRDROP_SOL must use at most 9 decimal places.');
  const lamports = BigInt(match[1]) * LAMPORTS_PER_SOL +
    BigInt((match[2] || '').padEnd(9, '0') || '0');
  if (lamports <= 0n || lamports > MAX_AIRDROP_LAMPORTS) {
    throw new Error('SOLANA_DEVNET_AIRDROP_SOL must be greater than 0 and at most 2 SOL.');
  }
  return lamports;
}

function parseRpcUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SOLANA_DEVNET_RPC_URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('SOLANA_DEVNET_RPC_URL must be an HTTPS URL without embedded credentials.');
  }
  return url.toString();
}

async function waitForConfirmation(connection, signature) {
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses(
      [signature],
      { searchTransactionHistory: true },
    );
    const status = response.value[0];
    if (status?.err) throw new Error('The devnet airdrop transaction failed.');
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return status.confirmationStatus;
    }
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
  throw new Error('The devnet airdrop was submitted but confirmation timed out. Check Explorer before retrying.');
}

function formatSol(lamports) {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole.toString();
}

async function main() {
  const address = parseAddress(requiredEnvironment('SOLANA_WALLET_ADDRESS'));
  const amountLamports = parseAirdropAmount(process.env.SOLANA_DEVNET_AIRDROP_SOL || '1');
  const connection = new Connection(parseRpcUrl(DEVNET_RPC_URL), 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error('Configured RPC is not Solana devnet. No airdrop was requested.');
  }
  const signature = await connection.requestAirdrop(address, Number(amountLamports));
  const status = await waitForConfirmation(connection, signature);
  const balanceLamports = BigInt(await connection.getBalance(address, 'confirmed'));
  console.log('Funded Solana devnet wallet.');
  console.log('  address: ' + address.toBase58());
  console.log('  airdrop: ' + formatSol(amountLamports) + ' SOL');
  console.log('  balance: ' + formatSol(balanceLamports) + ' SOL');
  console.log('  status: ' + status);
  console.log('  explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
}

main().catch(cause => {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error('Solana devnet funding failed: ' + message);
  console.error('The public faucet can rate-limit requests; no wallet secret is required to retry later.');
  process.exitCode = 1;
});
