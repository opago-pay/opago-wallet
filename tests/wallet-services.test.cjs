'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
require('./register-typescript.cjs');

const {
  deriveHederaPrivateKey,
  HEDERA_DERIVATION_PATH,
  HEDERA_KEY_ALGORITHM,
  HEDERA_KEY_DERIVATION,
  HEDERA_KEY_DERIVATION_VERSION,
  recoveryPhraseMatchesHederaPublicKey,
} = require('../lib/wallet-keys.ts');

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EXPECTED_HEDERA_PUBLIC_KEY =
  '793af21fd5a0a7cc1076195263717fab12600496dfc7ad49e902acdd0bf22331';

test('derives the documented Hedera Ed25519 account deterministically from BIP39', () => {
  assert.equal(HEDERA_DERIVATION_PATH, "m/44'/3030'/0'/0'");
  assert.equal(HEDERA_KEY_DERIVATION_VERSION, 1);
  assert.equal(HEDERA_KEY_ALGORITHM, 'ED25519');
  assert.deepEqual(HEDERA_KEY_DERIVATION, {
    version: 1,
    algorithm: 'ED25519',
    path: "m/44'/3030'/0'/0'",
  });
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
  assert.throws(() => deriveHederaPrivateKey(MNEMONIC, 2), /unsupported.*version/i);
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

test('reveals readable recovery words individually to accessibility only after explicit reveal', () => {
  const source = readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'), 'utf8');
  const phrase = readFileSync(path.join(__dirname, '..', 'components', 'security', 'recovery-phrase.tsx'), 'utf8');
  assert.match(source, /isRevealed && mnemonic &&/);
  assert.match(source, /walletSession.capture\(\)/);
  assert.match(phrase, /usePreventScreenCapture\('opago-recovery-phrase'\)/);
  assert.match(phrase, /accessibilityLabel=\{t\('Word \{number\}, \{word\}', \{ number: index \+ 1, word \}\)\}/);
  assert.match(phrase, /fontScale > 1\.2/);
  assert.doesNotMatch(phrase, /SvgText|no-hide-descendants|allowFontScaling=\{false\}/);
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
  assert.match(source, /Check my backup/);
  assert.doesNotMatch(source, /disabled=\{isDeleting \|\| !backupVerified\}/);
  assert.match(source, /if \(!deletionVerified\)/);
  assert.match(source, /const backupChecked = backupStatus === 'verified'/);
  assert.doesNotMatch(source, /Deletion is unlocked only|restore your old wallet/);
  assert.match(source, /performReset\(assertAuthorized\)/);
});

test('does not block Hedera wallet readiness on optional Spark startup', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'hooks', 'useWalletAuth.ts'),
    'utf8',
  );
  const walletReadyIndex = source.indexOf('setWalletReady(true);');
  const sparkStartupIndex = source.indexOf('void connectSpark(seed, generation);');

  assert.ok(walletReadyIndex >= 0, 'wallet readiness assignment is missing');
  assert.ok(sparkStartupIndex >= 0, 'background Spark startup is missing');
  assert.ok(
    walletReadyIndex < sparkStartupIndex,
    'optional Spark startup must happen after Hedera is ready',
  );
  assert.match(source, /const initializationGenerationRef = useRef\(0\)/);
  assert.match(
    source,
    /if \(initializationGenerationRef\.current !== generation\) return;/,
  );
  assert.match(source, /setSparkStatus\('error'\)/);
  assert.match(source, /maxAttempts: 3/);
});

test('keeps wallet creation local and free of external identity providers', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(auth)', 'login.tsx'),
    'utf8',
  );
  assert.doesNotMatch(source, /OAuth|external identity provider|Google/);
  assert.match(source, /Create a new wallet/);
  assert.match(source, /I already have a wallet/);
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
  assert.match(source, /isRestoring \? \(\s*<RecoveryForm/);
  assert.match(source, /AppState\.addEventListener\('change'/);
  assert.match(source, /setIsRestoring\(false\)/);
  const form = readFileSync(path.join(__dirname, '..', 'components', 'onboarding', 'recovery-form.tsx'), 'utf8');
  assert.match(form, /autoCorrect=\{false\}/);
  assert.match(form, /importantForAutofill="no"/);
  assert.match(form, /'visible-password'/);
  assert.match(form, /submitBehavior="submit"/);
});

test('pauses receive polling off-screen and backs off after transient failures', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'receive.tsx'),
    'utf8',
  );

  assert.match(source, /useIsFocused\(\)/);
  assert.match(source, /AppState\.addEventListener\('change'/);
  assert.match(source, /const pollingEnabled = isFocused && appIsActive/);
  assert.match(source, /exponentialBackoffDelay\(/);
  assert.match(source, /scheduleNextPoll\(8_000\)/);
  assert.doesNotMatch(source, /hederaRequest/);
});

test('bounds optional dashboard services and always releases pull-to-refresh', () => {
  const source = readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'),
    'utf8',
  );

  assert.match(source, /OPTIONAL_ASSET_REFRESH_TIMEOUT_MS = 8_000/);
  assert.match(source, /new HistoryPager<DisplayTransaction>/);
  assert.match(source, /generation !== refreshGenerationRef.current/);
  assert.match(source, /refreshInProgressRef/);
  assert.match(
    source,
    /async function onRefresh\(\) \{[\s\S]*?try \{[\s\S]*?await refreshBalances\(\);[\s\S]*?if \(historyOpen\) await refresh\(true\);[\s\S]*?\} finally \{\s*setRefreshing\(false\);/,
  );
});
