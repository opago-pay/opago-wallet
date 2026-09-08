[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $repoRoot '.codex-local-evidence\activation-test'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

# No dotenv or inherited public settings may select another network for this APK.
$savedEnvironment = @{}
$settings = @{
  CI = '1'
  EXPO_NO_DOTENV = '1'
  EXPO_NO_TELEMETRY = '1'
  NODE_ENV = 'production'
  EXPO_PUBLIC_ENABLE_MAINNET = 'false'
  EXPO_PUBLIC_HEDERA_NETWORK = 'testnet'
  EXPO_PUBLIC_HEDERA_BUILD_PROFILE = 'testnet'
  EXPO_PUBLIC_HEDERA_MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com'
  EXPO_PUBLIC_HEDERA_MAX_TRANSFER_HBAR = '1'
  EXPO_PUBLIC_HEDERA_CHECKOUT_CONTRACT_ID = '0.0.9972670'
  EXPO_PUBLIC_HEDERA_CHECKOUT_RUNTIME_SHA256 = '18dfd309cde03d2291101f3b77f8c5810664a5c52bbed3b63ccce4752d7943c8'
}

$initScript = Join-Path $outputDirectory 'activation-test.init.gradle'
@'
gradle.afterProject { project, state ->
    if (project.path == ':app' && state.failure == null) {
        project.android.defaultConfig.applicationId = 'com.opago.wallet.activationtest'
        project.android.buildTypes.release.applicationIdSuffix = null
    }
}
'@ | Set-Content -LiteralPath $initScript -Encoding ASCII

try {
  foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('EXPO_PUBLIC_') -or $_.Name -match '^HEDERA_.*KEY$' })) {
    $savedEnvironment[$entry.Name] = $entry.Value
    [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process')
  }
  foreach ($name in $settings.Keys) {
    if (-not $savedEnvironment.ContainsKey($name)) {
      $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
  }
  Push-Location (Join-Path $repoRoot 'android')
  try {
    # Local test signing only. Release variant embeds JS and requires no Metro.
    & .\gradlew.bat :app:assembleRelease --no-daemon --console=plain --max-workers=2 '-PreactNativeArchitectures=arm64-v8a' --init-script $initScript
    if ($LASTEXITCODE -ne 0) { throw 'Activation test APK build failed.' }
  } finally { Pop-Location }
  $sourceApk = Join-Path $repoRoot 'android\app\build\outputs\apk\release\app-release.apk'
  $targetApk = Join-Path $outputDirectory 'opago-activation-testnet.apk'
  Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
  $record = [ordered]@{
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    baseCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
    worktreeStatus = @(& git -C $repoRoot status --short)
    packageId = 'com.opago.wallet.activationtest'
    network = 'testnet'
    signing = 'local debug certificate; not a production release'
    apkSha256 = (Get-FileHash -LiteralPath $targetApk -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputDirectory 'build.json') -Encoding UTF8
  Write-Host "Testnet APK: $targetApk"
} finally {
  foreach ($name in $savedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
  }
}
