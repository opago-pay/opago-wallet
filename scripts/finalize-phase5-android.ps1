[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$MetroPort = 8081
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$evidenceDirectory = Join-Path $repoRoot '.codex-local-evidence'
$packageId = 'com.opago.wallet'
$expectedContractId = '0.0.9972670'
$expectedRuntimeSha256 = '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8'

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)]
    [string]$Label,
    [Parameter(Mandatory)]
    [string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Test-LocalTcpPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync('127.0.0.1', $Port)
    return $connection.Wait(250) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

Set-Location -LiteralPath $repoRoot

foreach ($requiredCommand in @('git.exe', 'node.exe', 'npm.cmd', 'npx.cmd', 'adb.exe')) {
  if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
    throw "$requiredCommand is required and was not found on PATH."
  }
}

$nodeVersionText = (& node.exe -p 'process.versions.node').Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to read the Node.js version.'
}
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]'20.19.0') {
  throw "Node.js 20.19.0 or newer is required; found $nodeVersionText."
}

$sensitiveVariables = @(
  'HEDERA_OPERATOR_KEY',
  'HEDERA_PRIVATE_KEY',
  'HEDERA_WALLET_PRIVATE_KEY'
)
foreach ($variableName in $sensitiveVariables) {
  $value = [Environment]::GetEnvironmentVariable($variableName, 'Process')
  if (-not [string]::IsNullOrWhiteSpace($value)) {
    throw "Clear process variable $variableName before building the client."
  }
}

$initialStatus = @(& git.exe status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to inspect the Git worktree.'
}
if ($initialStatus.Count -gt 0) {
  throw "The worktree must be clean before Phase 5 acceptance:`n$($initialStatus -join "`n")"
}

$commit = (& git.exe rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') {
  throw 'Unable to record the exact Git commit.'
}
$branch = (& git.exe branch --show-current).Trim()

if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
  Write-Host 'Created ignored .env from the committed safe testnet template.'
}

$localEnvironment = Get-Content -LiteralPath '.env' -Raw
if ($localEnvironment -match '(?m)^\s*HEDERA_(?:OPERATOR|PRIVATE|WALLET_PRIVATE)_KEY\s*=') {
  throw 'Remove private/operator key entries from .env before building.'
}

# These values are public and deliberately override any stale shell setting.
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_PUBLIC_ENABLE_MAINNET = 'false'
$env:EXPO_PUBLIC_HEDERA_NETWORK = 'testnet'
$env:EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = $expectedContractId
$env:EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = $expectedRuntimeSha256

$lockHashBefore = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash.ToLowerInvariant()

Invoke-CheckedCommand -Label 'Clean dependency install' -FilePath 'npm.cmd' -ArgumentList @(
  'ci',
  '--no-audit',
  '--no-fund'
)
Invoke-CheckedCommand -Label 'Phase 5 quality gates' -FilePath 'npm.cmd' -ArgumentList @(
  'run',
  'phase5:verify'
)

$lockHashAfter = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash.ToLowerInvariant()
if ($lockHashAfter -ne $lockHashBefore) {
  throw 'npm ci or the quality gates changed package-lock.json.'
}

& adb.exe kill-server | Out-Null
Invoke-CheckedCommand -Label 'Start Android Debug Bridge' -FilePath 'adb.exe' -ArgumentList @('start-server')

$deviceOutput = @(& adb.exe devices -l)
if ($LASTEXITCODE -ne 0) {
  throw 'adb devices failed.'
}
$unauthorizedDevices = @($deviceOutput | Where-Object { $_ -match '^\S+\s+unauthorized(?:\s|$)' })
if ($unauthorizedDevices.Count -gt 0) {
  throw 'The Android device is unauthorized. Accept the USB-debugging fingerprint on the device and rerun.'
}
$devices = @($deviceOutput | Where-Object { $_ -match '^\S+\s+device(?:\s|$)' })
if ($devices.Count -ne 1) {
  throw "Exactly one authorized Android device is required; found $($devices.Count)."
}
$serial = ($devices[0] -split '\s+')[0]
$deviceAbi = (& adb.exe -s $serial shell getprop ro.product.cpu.abi).Trim()
$deviceModel = (& adb.exe -s $serial shell getprop ro.product.model).Trim()
$androidRelease = (& adb.exe -s $serial shell getprop ro.build.version.release).Trim()
if ($deviceAbi -ne 'arm64-v8a') {
  throw "The reproducible milestone build targets arm64-v8a; the connected device reports $deviceAbi."
}

Invoke-CheckedCommand -Label 'Generate fresh Android project' -FilePath 'npx.cmd' -ArgumentList @(
  'expo',
  'prebuild',
  '--platform',
  'android',
  '--clean',
  '--no-install'
)

Push-Location -LiteralPath (Join-Path $repoRoot 'android')
try {
  Invoke-CheckedCommand -Label 'Build fresh arm64 development APK' -FilePath '.\gradlew.bat' -ArgumentList @(
    ':app:assembleDebug',
    '--no-daemon',
    '--console=plain',
    '-PreactNativeArchitectures=arm64-v8a'
  )
} finally {
  Pop-Location
}

$apkPath = Join-Path $repoRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $apkPath)) {
  throw "Gradle completed without producing $apkPath."
}
$apkHash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()

Invoke-CheckedCommand -Label 'Install exact development APK' -FilePath 'adb.exe' -ArgumentList @(
  '-s',
  $serial,
  'install',
  '-r',
  $apkPath
)
Invoke-CheckedCommand -Label 'Reverse Metro port to the device' -FilePath 'adb.exe' -ArgumentList @(
  '-s',
  $serial,
  'reverse',
  "tcp:$MetroPort",
  "tcp:$MetroPort"
)

if (Test-LocalTcpPort -Port $MetroPort) {
  throw "TCP port $MetroPort is already in use. Stop the existing Metro process and rerun."
}

New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
$metroStdout = Join-Path $evidenceDirectory 'metro.stdout.log'
$metroStderr = Join-Path $evidenceDirectory 'metro.stderr.log'
$metroProcess = Start-Process -FilePath 'npx.cmd' -ArgumentList @(
  'expo',
  'start',
  '--dev-client',
  '--localhost',
  '--port',
  $MetroPort.ToString()
) -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $metroStdout -RedirectStandardError $metroStderr -PassThru

$metroReady = $false
for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  if ($metroProcess.HasExited) {
    $details = Get-Content -LiteralPath $metroStderr -Raw -ErrorAction SilentlyContinue
    throw "Metro exited before becoming ready. $details"
  }
  if (Test-LocalTcpPort -Port $MetroPort) {
    $metroReady = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $metroReady) {
  Stop-Process -Id $metroProcess.Id -ErrorAction SilentlyContinue
  throw "Metro did not listen on port $MetroPort within 90 seconds."
}

& adb.exe -s $serial shell am force-stop $packageId | Out-Null
Invoke-CheckedCommand -Label 'Launch Opago Wallet' -FilePath 'adb.exe' -ArgumentList @(
  '-s',
  $serial,
  'shell',
  'monkey',
  '-p',
  $packageId,
  '-c',
  'android.intent.category.LAUNCHER',
  '1'
)
Start-Sleep -Seconds 8
$appPid = (& adb.exe -s $serial shell pidof $packageId).Trim()
if ([string]::IsNullOrWhiteSpace($appPid)) {
  throw "$packageId is not running after launch. Inspect $metroStderr and adb logcat."
}

$finalStatus = @(& git.exe status --porcelain=v1 --untracked-files=all)
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to verify the final Git worktree.'
}
if ($finalStatus.Count -gt 0) {
  throw "The tracked submission tree changed during acceptance:`n$($finalStatus -join "`n")"
}

$evidence = [ordered]@{
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  commit = $commit
  branch = $branch
  packageVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
  packageId = $packageId
  network = 'hedera-testnet'
  checkoutContractId = $expectedContractId
  runtimeBytecodeSha256 = $expectedRuntimeSha256
  packageLockSha256 = $lockHashAfter
  apkSha256 = $apkHash
  apkBytes = (Get-Item -LiteralPath $apkPath).Length
  deviceModel = $deviceModel
  deviceAbi = $deviceAbi
  androidRelease = $androidRelease
  appProcessRunning = $true
  metroPort = $MetroPort
  metroProcessId = $metroProcess.Id
}
$evidencePath = Join-Path $evidenceDirectory 'phase5-android-evidence.json'
$evidence | ConvertTo-Json | Set-Content -LiteralPath $evidencePath -Encoding utf8

Write-Host "`nPhase 5 Android acceptance build is running." -ForegroundColor Green
Write-Host "Commit: $commit"
Write-Host "APK SHA-256: $apkHash"
Write-Host "Evidence: $evidencePath"
Write-Host "Metro PID: $($metroProcess.Id) (left running for the manual dashboard and video check)"
Write-Host 'On the device, confirm HEDERA TESTNET, account ID, balance, Send, Receive, and the merchant checkout flow.'
