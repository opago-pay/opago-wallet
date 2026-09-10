[CmdletBinding()]
param(
  [string]$DeviceSerial = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $repoRoot '.codex-local-evidence\mainnet-candidate'
$packageId = 'com.opago.wallet.mainnetcandidate'
$expectedContractId = '0.0.10850063'
$expectedRuntimeSha256 = '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8'

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)] [string]$Label,
    [Parameter(Mandatory)] [string]$FilePath,
    [string[]]$ArgumentList = @()
  )
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

Set-Location -LiteralPath $repoRoot
foreach ($requiredCommand in @('git.exe', 'node.exe', 'npm.cmd', 'npx.cmd', 'adb.exe')) {
  if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
    throw "$requiredCommand is required and was not found on PATH."
  }
}

$dirty = @(& git.exe status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the Git worktree.' }
if ($dirty.Count -gt 0) {
  throw "The worktree must be clean before building the Mainnet candidate:`n$($dirty -join "`n")"
}

$manifest = Get-Content -LiteralPath 'deployments\hedera-mainnet.json' -Raw | ConvertFrom-Json
if (
  $manifest.network -ne 'mainnet' -or
  [int]$manifest.chainId -ne 295 -or
  $manifest.status -ne 'deployed' -or
  $manifest.contractId -ne $expectedContractId -or
  $manifest.runtimeBytecodeSha256 -ne $expectedRuntimeSha256 -or
  $manifest.sourceVerification.status -ne 'verified'
) {
  throw 'The Mainnet deployment manifest does not match the verified release evidence.'
}

$secretVariables = @(Get-ChildItem Env: | Where-Object {
  $_.Name -match '^HEDERA_.*(?:KEY|MNEMONIC|SECRET)$' -and
  -not [string]::IsNullOrWhiteSpace($_.Value)
})
if ($secretVariables.Count -gt 0) {
  throw 'Clear Hedera key, mnemonic, and secret environment variables before building the client.'
}

Invoke-CheckedCommand -Label 'Start Android Debug Bridge' -FilePath 'adb.exe' -ArgumentList @('start-server')
$deviceLines = @(& adb.exe devices -l)
if ($LASTEXITCODE -ne 0) { throw 'adb devices failed.' }
$authorized = @($deviceLines | Where-Object { $_ -match '^\S+\s+device(?:\s|$)' })
$unauthorized = @($deviceLines | Where-Object { $_ -match '^\S+\s+unauthorized(?:\s|$)' })
if ($unauthorized.Count -gt 0) { throw 'Accept the USB-debugging fingerprint on the Android device.' }
if ([string]::IsNullOrWhiteSpace($DeviceSerial)) {
  if ($authorized.Count -ne 1) {
    throw "Exactly one authorized Android device is required; found $($authorized.Count)."
  }
  $DeviceSerial = ($authorized[0] -split '\s+')[0]
} elseif (-not ($authorized | Where-Object { ($_ -split '\s+')[0] -eq $DeviceSerial })) {
  throw "Android device $DeviceSerial is not authorized or connected."
}

$deviceAbi = (& adb.exe -s $DeviceSerial shell getprop ro.product.cpu.abi).Trim()
$deviceModel = (& adb.exe -s $DeviceSerial shell getprop ro.product.model).Trim()
$androidRelease = (& adb.exe -s $DeviceSerial shell getprop ro.build.version.release).Trim()
if ($deviceAbi -ne 'arm64-v8a') {
  throw "The Mainnet candidate targets arm64-v8a; the device reports $deviceAbi."
}

$commit = (& git.exe rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
  throw 'Unable to record the exact Git commit.'
}

$qualitySettings = @{
  CI = '1'
  EXPO_NO_DOTENV = '1'
  EXPO_NO_TELEMETRY = '1'
  NODE_ENV = 'test'
  EXPO_PUBLIC_ENABLE_MAINNET = 'false'
  EXPO_PUBLIC_ENABLE_HEDERA_MAINNET = 'false'
  EXPO_PUBLIC_HEDERA_NETWORK = 'testnet'
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'testnet'
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com'
  EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = '1'
  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = '0.0.9972670'
  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = $expectedRuntimeSha256
  EXPO_PUBLIC_SOLANA_RPC_URL = 'https://api.devnet.solana.com'
  EXPO_PUBLIC_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'false'
}
$buildSettings = @{
  CI = '1'
  EXPO_NO_DOTENV = '1'
  EXPO_NO_TELEMETRY = '1'
  NODE_ENV = 'production'
  EXPO_PUBLIC_ENABLE_MAINNET = 'false'
  EXPO_PUBLIC_ENABLE_HEDERA_MAINNET = 'true'
  EXPO_PUBLIC_HEDERA_NETWORK = 'mainnet'
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'mainnet'
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL = 'https://mainnet.mirrornode.hedera.com'
  EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = '1'
  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = $expectedContractId
  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = $expectedRuntimeSha256
  EXPO_PUBLIC_SOLANA_RPC_URL = 'https://api.devnet.solana.com'
  EXPO_PUBLIC_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'false'
}
$savedEnvironment = @{}
$publicNames = @(Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('EXPO_PUBLIC_') } | ForEach-Object Name)
$managedNames = @($publicNames + $qualitySettings.Keys + $buildSettings.Keys | Select-Object -Unique)
foreach ($name in $managedNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$initScript = Join-Path $outputDirectory 'mainnet-candidate.init.gradle'
@'
gradle.afterProject { project, state ->
    if (project.path == ':app' && state.failure == null) {
        project.android.defaultConfig.applicationId = 'com.opago.wallet.mainnetcandidate'
        project.android.buildTypes.release.applicationIdSuffix = null
    }
}
'@ | Set-Content -LiteralPath $initScript -Encoding ASCII

try {
  foreach ($name in $qualitySettings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $qualitySettings[$name], 'Process')
  }

  Invoke-CheckedCommand -Label 'Mainnet candidate quality gates' -FilePath 'npm.cmd' -ArgumentList @(
    'run', 'phase5:verify'
  )
  foreach ($name in $buildSettings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $buildSettings[$name], 'Process')
  }
  Invoke-CheckedCommand -Label 'Verify isolated Mainnet build configuration' -FilePath 'npm.cmd' -ArgumentList @(
    'run', 'mainnet:config:verify'
  )
  Invoke-CheckedCommand -Label 'Generate fresh Android project' -FilePath 'npx.cmd' -ArgumentList @(
    'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'
  )

  Push-Location -LiteralPath (Join-Path $repoRoot 'android')
  try {
    Invoke-CheckedCommand -Label 'Build standalone arm64 Mainnet candidate' -FilePath '.\gradlew.bat' -ArgumentList @(
      ':app:assembleRelease',
      '--no-daemon',
      '--console=plain',
      '--max-workers=2',
      '-PreactNativeArchitectures=arm64-v8a',
      '--init-script',
      $initScript
    )
  } finally {
    Pop-Location
  }

  $sourceApk = Join-Path $repoRoot 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "Gradle completed without producing $sourceApk."
  }
  $targetApk = Join-Path $outputDirectory 'opago-wallet-hedera-mainnet-candidate.apk'
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
  $apkHash = (Get-FileHash -LiteralPath $targetApk -Algorithm SHA256).Hash.ToLowerInvariant()

  Invoke-CheckedCommand -Label 'Install Mainnet candidate' -FilePath 'adb.exe' -ArgumentList @(
    '-s', $DeviceSerial, 'install', '-r', $targetApk
  )
  & adb.exe -s $DeviceSerial shell am force-stop $packageId | Out-Null
  Invoke-CheckedCommand -Label 'Launch Mainnet candidate' -FilePath 'adb.exe' -ArgumentList @(
    '-s', $DeviceSerial, 'shell', 'monkey', '-p', $packageId,
    '-c', 'android.intent.category.LAUNCHER', '1'
  )
  Start-Sleep -Seconds 6
  $appPid = (& adb.exe -s $DeviceSerial shell pidof $packageId).Trim()
  if ([string]::IsNullOrWhiteSpace($appPid)) {
    throw "$packageId is not running after launch."
  }

  $record = [ordered]@{
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    commit = $commit
    packageId = $packageId
    signing = 'local debug certificate; internal Mainnet candidate, not store release'
    standalone = $true
    hederaNetwork = 'mainnet'
    hederaMaximumTransferHbar = '1'
    checkoutContractId = $expectedContractId
    runtimeBytecodeSha256 = $expectedRuntimeSha256
    solanaNetwork = 'devnet'
    lightningNetwork = 'regtest'
    swapsEnabled = $false
    apkSha256 = $apkHash
    apkBytes = (Get-Item -LiteralPath $targetApk).Length
    deviceSerial = $DeviceSerial
    deviceModel = $deviceModel
    deviceAbi = $deviceAbi
    androidRelease = $androidRelease
    appProcessRunning = $true
  }
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputDirectory 'build.json') -Encoding UTF8

  Write-Host "`nHedera Mainnet candidate is installed and running." -ForegroundColor Green
  Write-Host "APK: $targetApk"
  Write-Host "APK SHA-256: $apkHash"
  Write-Host "Package: $packageId"
  Write-Host 'Only Hedera uses Mainnet. Solana remains devnet, Lightning remains regtest, and swaps remain blocked.'
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}
