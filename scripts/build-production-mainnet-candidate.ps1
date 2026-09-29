[CmdletBinding()]
param(
  [string]$DeviceSerial = '',
  [string]$MoonPayBackendUrl = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $repoRoot '.codex-local-evidence\production-candidate'
$packageId = 'com.opago.wallet.productioncandidate'
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

function Get-Sha256Hex {
  param([Parameter(Mandatory)] [string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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
  throw "The worktree must be clean before building a production candidate:`n$($dirty -join "`n")"
}

$secretVariables = @(Get-ChildItem Env: | Where-Object {
  $_.Name -match '(?:PRIVATE|MNEMONIC|SEED|SECRET|PREIMAGE|OPERATOR_KEY)$' -and
  -not [string]::IsNullOrWhiteSpace($_.Value)
})
if ($secretVariables.Count -gt 0) {
  throw 'Clear private keys, recovery phrases, seeds, preimages, and secrets before building the client.'
}

Invoke-CheckedCommand -Label 'Start Android Debug Bridge' -FilePath 'adb.exe' -ArgumentList @('start-server')
$deviceLines = @(& adb.exe devices -l)
if ($LASTEXITCODE -ne 0) { throw 'adb devices failed.' }
$authorized = @($deviceLines | Where-Object { $_ -match '^\S+\s+device(?:\s|$)' })
$unauthorized = @($deviceLines | Where-Object { $_ -match '^\S+\s+unauthorized(?:\s|$)' })
if ($unauthorized.Count -gt 0) { throw 'Accept the debugging fingerprint on the Android device.' }
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
  throw "The candidate targets arm64-v8a; the device reports $deviceAbi."
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
  EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET = 'false'
  EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE = 'regtest'
  EXPO_PUBLIC_ENABLE_HEDERA_MAINNET = 'false'
  EXPO_PUBLIC_HEDERA_NETWORK = 'testnet'
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'testnet'
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com'
  EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = '1'
  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = '0.0.9972670'
  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = $expectedRuntimeSha256
  EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS = '100'
  EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'false'
}
$buildSettings = @{
  CI = '1'
  EXPO_NO_DOTENV = '1'
  EXPO_NO_TELEMETRY = '1'
  NODE_ENV = 'production'
  EXPO_PUBLIC_ENABLE_MAINNET = 'false'
  EXPO_PUBLIC_ENABLE_LIGHTNING_MAINNET = 'true'
  EXPO_PUBLIC_LIGHTNING_BUILD_PROFILE = 'mainnet'
  EXPO_PUBLIC_ENABLE_HEDERA_MAINNET = 'true'
  EXPO_PUBLIC_HEDERA_NETWORK = 'mainnet'
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'mainnet'
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL = 'https://mainnet.mirrornode.hedera.com'
  EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = 'balance'
  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = $expectedContractId
  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = $expectedRuntimeSha256
  EXPO_PUBLIC_MAX_LIGHTNING_FEE_SATS = '100'
  EXPO_PUBLIC_ALLOW_INSECURE_HTTP = 'false'
}
if (-not [string]::IsNullOrWhiteSpace($MoonPayBackendUrl)) {
  $parsedMoonPayBackend = $null
  if (-not [System.Uri]::TryCreate($MoonPayBackendUrl, [System.UriKind]::Absolute, [ref]$parsedMoonPayBackend) -or
      $parsedMoonPayBackend.Scheme -ne 'https' -or
      $parsedMoonPayBackend.HostNameType -ne [System.UriHostNameType]::Dns -or
      $parsedMoonPayBackend.Host -match '(^localhost$|\.local$)' -or
      $parsedMoonPayBackend.AbsolutePath -ne '/' -or
      -not [string]::IsNullOrEmpty($parsedMoonPayBackend.Query) -or
      -not [string]::IsNullOrEmpty($parsedMoonPayBackend.UserInfo) -or
      -not [string]::IsNullOrEmpty($parsedMoonPayBackend.Fragment)) {
    throw 'MoonPayBackendUrl must be a public HTTPS origin without credentials or a fragment.'
  }
  $buildSettings.EXPO_PUBLIC_MOONPAY_BACKEND_URL = $parsedMoonPayBackend.AbsoluteUri.TrimEnd('/')
}
$savedEnvironment = @{}
$publicNames = @(Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('EXPO_PUBLIC_') } | ForEach-Object Name)
$managedNames = @($publicNames + $qualitySettings.Keys + $buildSettings.Keys | Select-Object -Unique)
foreach ($name in $managedNames) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$initScript = Join-Path $outputDirectory 'production-candidate.init.gradle'
@'
gradle.afterProject { project, state ->
    if (project.path == ':app' && state.failure == null) {
        project.android.defaultConfig.applicationId = 'com.opago.wallet.productioncandidate'
        project.android.buildTypes.release.applicationIdSuffix = null
    }
}
'@ | Set-Content -LiteralPath $initScript -Encoding ASCII

try {
  foreach ($name in $qualitySettings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $qualitySettings[$name], 'Process')
  }
  Invoke-CheckedCommand -Label 'Production candidate quality gates' -FilePath 'npm.cmd' -ArgumentList @(
    'run', 'phase5:verify'
  )

  foreach ($name in $buildSettings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $buildSettings[$name], 'Process')
  }
  Invoke-CheckedCommand -Label 'Verify production Mainnet configuration' -FilePath 'npm.cmd' -ArgumentList @(
    'run', 'production:config:verify'
  )
  Invoke-CheckedCommand -Label 'Generate fresh Android project' -FilePath 'npx.cmd' -ArgumentList @(
    'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'
  )

  Push-Location -LiteralPath (Join-Path $repoRoot 'android')
  try {
    Invoke-CheckedCommand -Label 'Build standalone arm64 production candidate' -FilePath '.\gradlew.bat' -ArgumentList @(
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
  $targetApk = Join-Path $outputDirectory 'opago-wallet-production-mainnet-candidate.apk'
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
  $apkHash = Get-Sha256Hex -Path $targetApk

  Invoke-CheckedCommand -Label 'Install production candidate' -FilePath 'adb.exe' -ArgumentList @(
    '-s', $DeviceSerial, 'install', '-r', $targetApk
  )
  & adb.exe -s $DeviceSerial shell am force-stop $packageId | Out-Null
  Invoke-CheckedCommand -Label 'Launch production candidate' -FilePath 'adb.exe' -ArgumentList @(
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
    signing = 'local release candidate certificate; not an app-store artifact'
    standalone = $true
    hederaNetwork = 'mainnet'
    lightningNetwork = 'mainnet'
    sparkSdkVersion = '0.7.12'
    lightningMaximumFeeSats = 100
    checkoutContractId = $expectedContractId
    runtimeBytecodeSha256 = $expectedRuntimeSha256
    apkSha256 = $apkHash
    apkBytes = (Get-Item -LiteralPath $targetApk).Length
    deviceSerial = $DeviceSerial
    deviceModel = $deviceModel
    deviceAbi = $deviceAbi
    androidRelease = $androidRelease
    appProcessRunning = $true
    realFundsAcceptance = 'pending manual approval and LIGHTNING_MAINNET_ACCEPTANCE.md'
  }
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputDirectory 'build.json') -Encoding UTF8

  Write-Host "`nProduction Mainnet candidate is installed and running." -ForegroundColor Green
  Write-Host "APK: $targetApk"
  Write-Host "APK SHA-256: $apkHash"
  Write-Host "Package: $packageId"
  Write-Host 'No real-fund payment was initiated. Continue with LIGHTNING_MAINNET_ACCEPTANCE.md.'
} finally {
  foreach ($name in $managedNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}
