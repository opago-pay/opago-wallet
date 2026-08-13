'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PublicKey } = require('@solana/web3.js');
require('./register-typescript.cjs');

const {
  deriveHederaPrivateKey,
  deriveSolanaKeypair,
  HEDERA_DERIVATION_PATH,
  recoveryPhraseMatchesHederaPublicKey,
  SOLANA_DERIVATION_PATH,
} = require('../lib/wallet-keys.ts');
const {
  getNativeTransferDeltaLamports,
  SOLANA_GENESIS_HASHES,
} = require('../lib/solana.ts');

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const EXPECTED_HEDERA_PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';

test('pins the complete Solana mainnet and devnet genesis hashes', () => {
  assert.equal(
    SOLANA_GENESIS_HASHES.mainnet,
    '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  );
  assert.equal(
    SOLANA_GENESIS_HASHES.devnet,
    'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  );
});

test('derives the documented Solana account deterministically from BIP39', () => {
  assert.equal(SOLANA_DERIVATION_PATH, "m/44'/501'/0'/0'");
  assert.equal(deriveSolanaKeypair(MNEMONIC).publicKey.toBase58(), EXPECTED_ADDRESS);
  assert.equal(
    deriveSolanaKeypair('  ' + MNEMONIC.toUpperCase().replaceAll(' ', '   ') + '  ').publicKey.toBase58(),
    EXPECTED_ADDRESS,
  );
  assert.throws(() => deriveSolanaKeypair('not a recovery phrase'), /valid BIP39/i);
});

test('derives the documented Hedera Ed25519 account deterministically from BIP39', () => {
  assert.equal(HEDERA_DERIVATION_PATH, "m/44'/3030'/0'/0'");
  assert.equal(
    deriveHederaPrivateKey(MNEMONIC).publicKey.toStringRaw(),
    EXPECTED_HEDERA_PUBLIC_KEY,
  );
  assert.equal(
    deriveHederaPrivateKey('  ' + MNEMONIC.toUpperCase().replaceAll(' ', '   ') + ' ')
      .publicKey.toStringRaw(),
    EXPECTED_HEDERA_PUBLIC_KEY,
  );
  assert.throws(() => deriveHederaPrivateKey('not a recovery phrase'), /valid BIP39/i);
});

test('verifies a recovery phrase against the exact Hedera public key', () => {
  assert.equal(
    recoveryPhraseMatchesHederaPublicKey(MNEMONIC, EXPECTED_HEDERA_PUBLIC_KEY),
    true,
  );
  assert.equal(
    recoveryPhraseMatchesHederaPublicKey(
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
      EXPECTED_HEDERA_PUBLIC_KEY,
    ),
    false,
  );
  assert.equal(
    recoveryPhraseMatchesHederaPublicKey('not a recovery phrase', EXPECTED_HEDERA_PUBLIC_KEY),
    false,
  );
  assert.equal(recoveryPhraseMatchesHederaPublicKey(MNEMONIC, 'not-a-public-key'), false);
});

test('keeps a revealed recovery phrase out of the accessibility tree', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'),
    'utf8',
  );
  assert.equal(
    source.match(/importantForAccessibility="no-hide-descendants"/g)?.length,
    2,
  );
  assert.match(source, /collapsable=\{false\}/);
  assert.match(source, /accessibilityElementsHidden/);
  assert.match(source, /<SvgText/);
  assert.doesNotMatch(source, /<Text[^>]*>\s*\{phrase\}/);
  assert.match(source, /Recovery phrase revealed\. Tap to hide\./);
  assert.doesNotMatch(source, /accessibilityLabel=\{(?:mnemonic|phrase)\}/);
});

test('requires local recovery verification before deleting wallet keys', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /recoveryPhraseMatchesHederaPublicKey/);
  assert.match(source, /if \(!phrase \|\| !hederaPublicKey\)/);
  assert.match(source, /selectBackupChallengePositions\(words\.length\)/);
  assert.match(source, /expectedWords: positions\.map\(position => words\[position\]\)/);
  assert.match(source, /backupChallenge && <SensitiveInputScreenCaptureGuard/);
  assert.match(source, /usePreventScreenCapture\('opago-recovery-verification'\)/);
  assert.match(source, /setBackupWordInput\(''\)/);
  assert.match(source, /KeyboardAvoidingView/);
  assert.match(source, /Start 3-word backup check/);
  assert.match(source, /disabled=\{isDeleting \|\| !backupVerified\}/);
  assert.match(source, /if \(!backupVerified\)/);
  assert.match(source, /Deletion is unlocked only for this app session\./);
});

test('does not block Hedera wallet readiness on optional Spark startup', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'hooks', 'useWalletAuth.ts'),
    'utf8',
  );
  const walletReadyIndex = source.indexOf('setWalletReady(true);');
  const sparkStartupIndex = source.indexOf('void initializeSparkWallet(mnemonic)');

  assert.ok(walletReadyIndex >= 0, 'wallet readiness assignment is missing');
  assert.ok(sparkStartupIndex >= 0, 'background Spark startup is missing');
  assert.ok(
    walletReadyIndex < sparkStartupIndex,
    'optional Spark startup must happen after Hedera and Solana are ready',
  );
  assert.match(source, /const initializationGenerationRef = useRef\(0\)/);
  assert.match(
    source,
    /if \(initializationGenerationRef\.current !== generation\) return;/,
  );
  assert.match(source, /Lightning wallet unavailable:/);
});

test('does not mount the Privy OAuth hook in a local-wallet build', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(auth)', 'login.tsx'),
    'utf8',
  );
  const loginScreen = source.slice(
    source.indexOf('export default function LoginScreen'),
    source.indexOf('const styles = StyleSheet.create'),
  );

  assert.match(source, /function OAuthLoginButton/);
  assert.match(source, /const \{ login \} = useLoginWithOAuth\(\{ onSuccess \}\)/);
  assert.doesNotMatch(loginScreen, /useLoginWithOAuth\(/);
  assert.match(
    loginScreen,
    /appConfig\.importSolanaKeyToPrivy && \(\s*<OAuthLoginButton/,
  );
});

test('keeps recovery entry visible above the keyboard and blocks capture', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(auth)', 'login.tsx'),
    'utf8',
  );

  assert.match(source, /usePreventScreenCapture\('opago-recovery-input'\)/);
  assert.match(source, /isRestoring && <RecoveryInputScreenCaptureGuard/);
  assert.match(source, /<KeyboardAvoidingView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /textAlignVertical="top"/);
  assert.match(source, /\{recoveryWordCount\} words entered/);
  assert.match(source, /setMnemonicInput\(''\);\s*setIsRestoring\(false\);/);
});

test('keeps receive polling rejections handled across scheduled retries', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'receive.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /setTimeout\(initializeAndPoll/);
  assert.match(
    source,
    /setTimeout\(\(\) => \{\s*void initializeAndPoll\(\)\.catch\(\(\) => scheduleNextPoll\(\)\);/,
  );
  assert.match(source, /void initializeAndPoll\(\)\.catch\(\(\) => scheduleNextPoll\(\)\);/);
});

test('bounds optional dashboard services and always releases pull-to-refresh', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
    'utf8',
  );

  assert.match(source, /OPTIONAL_ASSET_REFRESH_TIMEOUT_MS = 8_000/);
  assert.match(source, /await Promise\.all\(\[refreshLightning\(\), refreshSolana\(\)\]\)/);
  assert.equal(source.match(/await withTimeout\(/g)?.length, 2);
  assert.match(
    source,
    /async function onRefresh\(\) \{[\s\S]*?try \{[\s\S]*?await refresh\(\);[\s\S]*?\} finally \{\s*setRefreshing\(false\);/,
  );
});

test('counts only parsed system transfers involving the wallet', () => {
  const wallet = new PublicKey(EXPECTED_ADDRESS);
  const other = '11111111111111111111111111111111';
  const transaction = {
    transaction: {
      message: {
        instructions: [
          { program: 'system', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 1_000_000 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: EXPECTED_ADDRESS, destination: other, lamports: 250_000 } } },
          { program: 'spl-token', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 9_000_000 } } },
        ],
      },
    },
    meta: {
      innerInstructions: [{
        instructions: [
          { program: 'system', parsed: { type: 'transferChecked', info: { source: other, destination: EXPECTED_ADDRESS, lamports: 500_000 } } },
          { program: 'system', parsed: { type: 'transfer', info: { source: other, destination: EXPECTED_ADDRESS, lamports: -1 } } },
        ],
      }],
    },
  };

  assert.equal(getNativeTransferDeltaLamports(transaction, wallet), 1_250_000);
  assert.equal(getNativeTransferDeltaLamports({ transaction: {} }, wallet), 0);
});
