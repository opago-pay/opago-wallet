'use strict';
// Offline baseline generation. Inputs are ONLY public synthetic entropy, never a real wallet.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sdkRoot = path.resolve(process.argv[2] || path.join(root, 'node_modules/@buildonspark/spark-sdk'));
if (JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8')).version !== '0.7.12') throw new Error('Baseline requires the published SDK 0.7.12.');
const {DefaultSparkSigner, SparkWallet, KeyDerivationType} = require(path.join(sdkRoot, 'dist/index.node.cjs'));
const bip39 = require(root + '/node_modules/bip39');
(async () => {
 const vectors = [];
 for (const bytes of [16,20,24,28,32]) for (const account of [0,1]) {
  const mnemonic = bip39.entropyToMnemonic(Buffer.alloc(bytes, 0x42));
  const signer = new DefaultSparkSigner();
  const identity = await signer.createSparkWalletFromSeed(bip39.mnemonicToSeedSync(mnemonic), account);
  const keys = {};
  for (const name of ['identityKey','signingKey','depositKey','staticDepositKey','htlcPreimageKey']) keys[name] = Buffer.from(signer[name].publicKey).toString('hex');
  const derivations = [{type:KeyDerivationType.LEAF,path:'00000000-0000-4000-8000-000000000001'}, {type:KeyDerivationType.STATIC_DEPOSIT,path:0}];
  const derived = [];
  for(const d of derivations) derived.push(Buffer.from(await signer.getPublicKeyFromDerivation(d)).toString('hex'));
  const network = account === 0 ? 'REGTEST' : 'MAINNET';
  const wallet = new SparkWallet({network}, signer);
  vectors.push({entropyBytes:bytes,entropyByte:66,account,network,identity,keys,derived,address:await wallet.getSparkAddress()});
 }
 fs.writeFileSync(root+'/tests/fixtures/spark-0712-identity.json',JSON.stringify({sdk:'0.7.12',synthetic:true,vectors},null,2)+'\n');
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
