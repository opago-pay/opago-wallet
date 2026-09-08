# Hedera Mainnet deployment runbook

**Status:** prepared, not deployed. Do not run the real deployment until the public preflight passes and Opago explicitly authorizes the irreversible Mainnet transaction.

## Grant scope

This runbook supports Thrive Milestone 2: deploy the Opago HBAR checkout contract on Hedera Mainnet, bind the existing Android Hedera flow to the verified deployment, execute a real HBAR canary payment, and preserve public evidence. This repository remains the public multi-chain hackathon project. Solana, USDC, Lightning, and swap functionality are not removed or represented as production-ready by this Hedera milestone.

The Hedera path uses HBAR, Hedera Smart Contract Service, consensus receipts, and the official Mainnet Mirror Node. HTS and HCS are not required by this checkout use case and must not be added only to inflate the integration claim.

## Locked public inputs

| Item | Value |
| --- | --- |
| Network | Hedera Mainnet |
| Chain ID | `295` |
| Deployment account | `0.0.10848889` |
| Deployment-account key type | `ED25519` |
| Mainnet Mirror Node | `https://mainnet.mirrornode.hedera.com` |
| Mainnet explorer | `https://hashscan.io/mainnet` |
| Contract | `OpagoHbarCheckout` |
| Runtime SHA-256 | `18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8` |

The account ID, public key type, contract hashes, transaction IDs, and deployed addresses are public. Private keys and recovery phrases are not evidence and must never be pasted into chat, Git, screenshots, `EXPO_PUBLIC_*`, or the deployment manifest.

## 1. Public preflight — safe to run now

Compile and test the exact artifact:

```powershell
Set-Location C:\dev\opago-wallet
npm run contract:compile
npm run contract:test
$env:HEDERA_OPERATOR_ID='0.0.10848889'
npm run contract:preflight:mainnet
Remove-Item Env:HEDERA_OPERATOR_ID -ErrorAction SilentlyContinue
```

The preflight uses only public Mirror Node data. It verifies the network, account, public key type, balance, current ContractCreate gas price, undeployed manifest, and artifact hashes. It never accepts a private key and never submits a transaction.

The deployment client caps each transaction at 25 HBAR. Because `ContractCreateFlow` can perform multiple network operations and a canary payment still needs funds, the preflight requires a 30 HBAR starting balance. This is a safety reserve, not the expected charge. Rerun the preflight immediately before deployment because fees and the HBAR/USD conversion can change.

## 2. Human authorization gate

Before entering a key, verify all of the following:

- the preflight passes against `0.0.10848889` on Mainnet;
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run contract:test` pass on the intended commit;
- `deployments/hedera-mainnet.json` still says `not-deployed`;
- the runtime hash printed by the preflight is exactly the locked value above;
- Opago approves spending real HBAR and understands that a deployed immutable contract cannot be edited or deleted;
- the key holder is at the local PowerShell prompt and will not reveal the key.

## 3. Mainnet deployment — real HBAR

Run only after the human authorization gate. Enter the ED25519 private key into the hidden prompt locally:

```powershell
Set-Location C:\dev\opago-wallet
$env:HEDERA_OPERATOR_ID='0.0.10848889'
$env:HEDERA_OPERATOR_KEY_TYPE='ED25519'
$env:HEDERA_APPROVED_RUNTIME_SHA256='18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8'
$env:HEDERA_MAINNET_DEPLOY_APPROVAL='DEPLOY_OPAGO_HBAR_CHECKOUT_TO_MAINNET'
$hederaMainnetSecret=Read-Host 'Mainnet ED25519 private key eingeben' -AsSecureString
$env:HEDERA_OPERATOR_KEY=[System.Net.NetworkCredential]::new('', $hederaMainnetSecret).Password
try {
  npm run contract:deploy:mainnet
  if ($LASTEXITCODE -ne 0) { throw 'Mainnet deployment failed.' }
} finally {
  Remove-Item Env:HEDERA_OPERATOR_ID,Env:HEDERA_OPERATOR_KEY,Env:HEDERA_OPERATOR_KEY_TYPE,Env:HEDERA_APPROVED_RUNTIME_SHA256,Env:HEDERA_MAINNET_DEPLOY_APPROVAL -ErrorAction SilentlyContinue
  Remove-Variable hederaMainnetSecret -ErrorAction SilentlyContinue
}
```

The script independently loads the Mainnet account, checks that the entered private key belongs to it, refuses an empty account, verifies the approved artifact hash, refuses a recorded redeployment, and writes only public evidence after a successful receipt.

## 4. Independent public verification

After a successful deployment:

```powershell
npm run contract:verify:mainnet
```

Verification requires all of these to match:

- manifest network and chain ID;
- Contract ID and EVM address from Mainnet Mirror Node;
- deployed runtime bytecode and the compiled artifact hash;
- exact Sourcify runtime match;
- consensus timestamp and public HashScan links.

Do not configure the Android Mainnet build until verification succeeds and `deployments/hedera-mainnet.json` records `sourceVerification.status` as `verified`.

## 4.1 Separate Mainnet merchant reference demo

The merchant QR generator is a separate local reference service; it is not part of the consumer wallet app. It refuses to start on Mainnet until the versioned Mainnet deployment manifest contains a source-verified contract whose network, chain ID, address, and runtime hash pass validation.

After deployment verification, start it with a real Mainnet merchant account that is different from the wallet account used to pay:

```powershell
Set-Location C:\dev\opago-wallet
$env:HEDERA_MERCHANT_ID='0.0.YOUR_MAINNET_MERCHANT'
npm run demo:hedera-checkout:mainnet
```

The page displays `HEDERA MAINNET - REAL HBAR`, obtains the merchant EVM address from the official Mainnet Mirror Node, and binds every request to chain ID `295`, the verified contract, merchant, exact tinybar amount, random nonce, and expiry. Stop the server and clear the public account variable after recording:

```powershell
Remove-Item Env:HEDERA_MERCHANT_ID -ErrorAction SilentlyContinue
```

## 5. Android canary and grant evidence

After verification, pin the Android Mainnet build to the recorded Contract ID and runtime SHA-256. The canary evidence must show:

1. visible Hedera Mainnet status and real HBAR balance;
2. a freshly generated merchant request with a small amount;
3. merchant, amount, fee context, contract, and network review before signing;
4. successful platform authentication and consensus-confirmed payment;
5. the exact transaction and contract on Mainnet HashScan;
6. the transaction in wallet history after refresh/restart;
7. one invalid or expired request remaining failed rather than becoming a false success.

Record only public IDs, URLs, timestamps, app version, commit, and artifact hashes. If deployment or canary fails, retain the failure evidence, do not relabel it as success, and do not edit the deployed contract. A replacement deployment requires a new explicit approval and a new manifest history.
