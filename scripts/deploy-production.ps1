param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$publicDirectory = Join-Path $repositoryRoot '.output\public'
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$remoteHost = 'root@185.240.103.224'
$releasesDirectory = '/var/www/kadonext/releases'

Set-Location $repositoryRoot

if (-not $SkipBuild) {
  Write-Host 'Building production output...'
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Production build failed with exit code $LASTEXITCODE."
  }
}

if (-not (Test-Path (Join-Path $publicDirectory 'index.html'))) {
  throw 'Missing .output/public/index.html. Run npm run build first.'
}
if (-not (Test-Path (Join-Path $publicDirectory 'ru\projects\index.html'))) {
  throw 'Missing prerendered /ru/projects page in .output/public.'
}
if (-not (Test-Path $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}

$commit = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $commit) {
  throw 'Could not resolve the current Git commit.'
}

$releaseId = "$(Get-Date -Format 'yyyyMMddHHmmss')-$commit"
$releasePath = "$releasesDirectory/$releaseId"
$archiveName = "kadonext-$releaseId.tar.gz"
$archivePath = Join-Path ([IO.Path]::GetTempPath()) $archiveName
$remoteArchive = "/tmp/$archiveName"
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')

try {
  Write-Host "Packing release $releaseId..."
  & tar -czf $archivePath -C $publicDirectory .
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create release archive (exit code $LASTEXITCODE)."
  }

  Write-Host 'Creating release directory...'
  & ssh @sshArguments $remoteHost "mkdir -p '$releasePath'"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create $releasePath on production."
  }

  Write-Host 'Uploading release...'
  & scp -i $sshKey -o BatchMode=yes -o ConnectTimeout=10 $archivePath "${remoteHost}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) {
    throw "Release upload failed with exit code $LASTEXITCODE."
  }

  $activateCommand = @(
    'set -eu'
    "tar -xzf '$remoteArchive' -C '$releasePath'"
    "test -f '$releasePath/index.html'"
    "test -f '$releasePath/ru/projects/index.html'"
    "test -f '$releasePath/fonts/fixel/FixelText-Regular.woff2'"
    'nginx -t'
    "ln -sfn '$releasePath' '/var/www/kadonext/current.next'"
    "mv -Tf '/var/www/kadonext/current.next' '/var/www/kadonext/current'"
    "rm -f '$remoteArchive'"
  ) -join '; '

  Write-Host 'Activating release atomically...'
  & ssh @sshArguments $remoteHost $activateCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Release activation failed with exit code $LASTEXITCODE."
  }

  $projectsHtml = (& curl.exe -fsS 'https://kadonext.com/ru/projects/') -join "`n"
  if ($LASTEXITCODE -ne 0 -or $projectsHtml -notmatch '/fonts/fixel/FixelText-Regular\.woff2') {
    throw 'Production health check failed: /ru/projects does not contain the root-relative font URL.'
  }

  $fontStatus = (& curl.exe -sS -o NUL -w '%{http_code}' 'https://kadonext.com/fonts/fixel/FixelText-Regular.woff2').Trim()
  if ($fontStatus -ne '200') {
    throw "Production font health check returned HTTP $fontStatus."
  }

  Write-Host "Production deploy complete: $releasePath"
}
finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
