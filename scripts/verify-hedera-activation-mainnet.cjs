/* Manual Mainnet acceptance: --create authorizes ONE sponsored zero-balance
 * account for a dedicated test wallet. Default only reads its existing job.
 * Recovery words are encrypted with Windows DPAPI, never logged or uploaded. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateMnemonic } = require('bip39');
const baseUrl = 'https://hedera-activation.opago.com';
Object.assign(process.env, {
  ...require('../eas.json').build['mainnet-candidate'].env,
  NODE_ENV: 'production', EXPO_PUBLIC_ENABLE_MAINNET: 'false',
  EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET: 'false', EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE: 'regtest',
  EXPO_PUBLIC_ENABLE_HEDERA_MAINNET: 'true', EXPO_PUBLIC_HEDERA_NETWORK: 'mainnet',
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE: 'mainnet',
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL: 'https://mainnet.mirrornode.hedera.com',
  EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL: baseUrl,
});
require('../tests/register-typescript.cjs');
const { deriveHederaPrivateKey } = require('../lib/hedera/keys.ts');
const { requestHederaActivation, signActivationChallenge, ActivationApiError } = require('../lib/hedera/activation-api.ts');
const { runHederaActivation } = require('../lib/hedera/activation-flow.ts');
const { loadHederaAccount } = require('../lib/hedera/account.ts');
const dir = path.join(__dirname, '..', '.codex-local-evidence', 'activation-mainnet');
const vault = path.join(dir, 'recovery.dpapi');
function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('This acceptance helper requires Windows DPAPI.');
  const command = decrypt
    ? '$s = [Console]::In.ReadToEnd() | ConvertTo-SecureString; $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }'
    : '$s = ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force; [Console]::Write(($s | ConvertFrom-SecureString))';
  const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { input: value, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Local recovery vault failed.');
  return result.stdout.trim();
}
async function post(route, body) {
  const response = await fetch(baseUrl + route, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json() };
}
async function main() {
  const create = process.argv.includes('--create');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(vault)) {
    if (!create) throw new Error('No test wallet exists. Use --create only for an explicitly authorized Mainnet activation.');
    fs.writeFileSync(vault, protect(generateMnemonic(256)), { flag: 'wx' });
  }
  const key = deriveHederaPrivateKey(protect(fs.readFileSync(vault, 'utf8'), true));
  const publicKey = key.publicKey.toStringRaw();
  const evidence = { at: new Date().toISOString(), network: 'mainnet', baseUrl, publicKey, checks: [], jobs: [] };
  const save = () => fs.writeFileSync(path.join(dir, create ? 'activation.json' : 'recovery.json'), JSON.stringify(evidence, null, 2));
  if (process.argv.includes('--protocol-check')) {
    const c = await post('/v1/challenges', { network: 'mainnet', public_key: publicKey });
    assert.equal(c.status, 200);
    const body = { network: 'mainnet', public_key: publicKey, challenge_id: c.body.challenge_id,
      signature: Buffer.from(key.sign(Buffer.from(c.body.message.slice(0,-1)))).toString('hex') };
    const invalid = await post('/v1/activations/status', body);
    assert.equal(invalid.status, 401); assert.equal(invalid.body.error.code,'INVALID_SIGNATURE');
    evidence.checks.push('missing final LF rejected with 401 INVALID_SIGNATURE');
    body.signature = signActivationChallenge(c.body, key);
    const status = await post('/v1/activations/status', body);
    assert.ok(status.status === 200 || status.status === 404);
    if (status.status === 404) assert.equal(status.body.error.code,'JOB_NOT_FOUND');
    evidence.checks.push('exact raw UTF-8 signature accepted; status is read-only');
    const replay = await post('/v1/activations/status', body);
    assert.equal(replay.status,401); assert.equal(replay.body.error.code,'CHALLENGE_USED');
    evidence.checks.push('consumed proof replay rejected');
    const wrongNetwork = await post('/v1/challenges', { network: 'testnet', public_key: publicKey });
    assert.equal(wrongNetwork.status,400); assert.equal(wrongNetwork.body.error.code,'NETWORK_DISABLED');
    evidence.checks.push('wrong network rejected');
    save();
    console.log(JSON.stringify({ checks: evidence.checks }));
  }
  const bind = async accountId => {
    const account = await loadHederaAccount(accountId, publicKey);
    assert.ok(account, 'Mirror account must exist');
    assert.equal(account.accountId,accountId); assert.equal(account.publicKey,publicKey);
    evidence.accountId = accountId;
    evidence.balanceTinybars = account.balanceTinybars.toString();
    evidence.checks.push('official Mainnet Mirror exact account ID and derived Ed25519 key match');
    save();
  };
  if (create) {
    await runHederaActivation({ scope: 'live-' + publicKey, assertCurrent: () => {},
      request: existing => requestHederaActivation(key, () => {}, existing), bind,
      onJob: job => { evidence.jobs.push(job); save(); console.log(JSON.stringify(job)); },
      onError: code => { if (code) console.log(JSON.stringify({ code })); },
    });
  } else {
    const job = await requestHederaActivation(key, () => {}, true);
    evidence.jobs.push(job);
    if (job.status === 'confirmed') await bind(job.account_id);
    save();
    console.log(JSON.stringify(job));
  }
  if (!evidence.accountId) throw new Error('Activation not confirmed; public evidence saved. Resume the SAME wallet.');
  console.log(JSON.stringify({ verified: true, accountId: evidence.accountId, checks: evidence.checks }));
}
main().catch(error => { console.error(error instanceof ActivationApiError ? error.code : error.message); process.exitCode = 1; });
