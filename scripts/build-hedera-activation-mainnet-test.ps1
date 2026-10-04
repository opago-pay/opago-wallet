[CmdletBinding()]
param([string]$NativeBuildDirectory = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $repoRoot '.codex-local-evidence\activation-mainnet-build'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$profile = (Get-Content (Join-Path $repoRoot 'eas.json') -Raw | ConvertFrom-Json).build.'mainnet-candidate'.env
$settings = @{ CI='1'; EXPO_NO_DOTENV='1'; EXPO_NO_TELEMETRY='1'; NODE_ENV='production'; SENTRY_DISABLE_AUTO_UPLOAD='true' }
foreach ($property in $profile.PSObject.Properties) { $settings[$property.Name] = [string]$property.Value }
if ($settings.EXPO_PUBLIC_HEDERA_NETWORK -ne 'mainnet' -or $settings.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL -ne 'https://hedera-activation.opago.com') { throw 'The Mainnet activation profile is invalid.' }
if ([string]::IsNullOrWhiteSpace($NativeBuildDirectory)) { $NativeBuildDirectory = Join-Path $outputDirectory 'native' }
New-Item -ItemType Directory -Force -Path $NativeBuildDirectory | Out-Null
$nativeBuildPath = (Resolve-Path -LiteralPath $NativeBuildDirectory).Path.Replace('\', '/')
$savedEnvironment = @{}
try {
  foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name.StartsWith('EXPO_PUBLIC_') })) {
    $savedEnvironment[$entry.Name] = $entry.Value
    [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process')
  }
  foreach ($name in $settings.Keys) {
    if (-not $savedEnvironment.ContainsKey($name)) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
  }
  Push-Location $repoRoot
  try {
    & node scripts/verify-hedera-mainnet-build-config.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Mainnet configuration check failed.' }
    if (-not (Test-Path 'android/gradlew.bat')) {
      & npx.cmd expo prebuild --platform android --no-install
      if ($LASTEXITCODE -ne 0) { throw 'Android native generation failed.' }
    }
    $initScript = Join-Path $outputDirectory 'activation.init.gradle'
    "gradle.afterProject { project, state -> if (project.path == ':app' && state.failure == null) { project.android.defaultConfig.applicationId = 'com.opago.wallet.activationmainnet'; project.android.buildTypes.release.applicationIdSuffix = null; project.android.externalNativeBuild.cmake.buildStagingDirectory = project.file('$nativeBuildPath'); project.android.defaultConfig.externalNativeBuild.cmake.arguments.add('-DCMAKE_OBJECT_PATH_MAX=240') } }" | Set-Content -LiteralPath $initScript -Encoding ASCII
    Push-Location 'android'
    try {
      & .\gradlew.bat :app:assembleRelease --no-daemon --console=plain --max-workers=2 '-PreactNativeArchitectures=arm64-v8a' --init-script $initScript
      if ($LASTEXITCODE -ne 0) { throw 'Mainnet activation test APK build failed.' }
    } finally { Pop-Location }
    $apk = Join-Path $outputDirectory 'opago-activation-mainnet.apk'
    Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination $apk -Force
    [ordered]@{ builtAtUtc=[DateTime]::UtcNow.ToString('o'); network='mainnet'; baseUrl=$settings.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
      packageId='com.opago.wallet.activationmainnet'; signing='local test certificate; not a store release';
      baseCommit=(& git rev-parse HEAD); apkSha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDirectory 'build.json') -Encoding UTF8
    Write-Output $apk
  } finally { Pop-Location }
} finally {
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
