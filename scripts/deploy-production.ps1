param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$publicDirectory = Join-Path $repositoryRoot '.output\public'
$nginxConfig = Join-Path $repositoryRoot 'ops\nginx\kadonext.conf'
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
if (-not (Test-Path (Join-Path $publicDirectory '.locale-root\ru.html')) -or
    -not (Test-Path (Join-Path $publicDirectory '.locale-root\en.html'))) {
  throw 'Missing locale-selected root pages. Run npm run build first.'
}
if (-not (Test-Path $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}
if (-not (Test-Path $nginxConfig)) {
  throw "Missing production nginx config: $nginxConfig"
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
$remoteNginxConfig = "/tmp/kadonext-nginx-$releaseId.conf"
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

  Write-Host 'Uploading nginx config...'
  & scp -i $sshKey -o BatchMode=yes -o ConnectTimeout=10 $nginxConfig "${remoteHost}:$remoteNginxConfig"
  if ($LASTEXITCODE -ne 0) {
    throw "Nginx config upload failed with exit code $LASTEXITCODE."
  }

  $activateCommand = @'
set -euo pipefail
release='__RELEASE__'
archive='__ARCHIVE__'
candidate='__NGINX__'
config='/etc/nginx/sites-enabled/kadonext'
current='/var/www/kadonext/current'
backup='/tmp/kadonext-nginx-__ID__.backup'
old_release=$(readlink -f "$current")
activated=0

tar -xzf "$archive" -C "$release"
test -f "$release/index.html"
test -f "$release/ru/projects/index.html"
test -f "$release/.locale-root/ru.html"
test -f "$release/.locale-root/en.html"
test -f "$release/fonts/fixel/FixelVariable.woff2"
cp "$config" "$backup"

rollback() {
  cp "$backup" "$config"
  if [ "$activated" = 1 ]; then
    ln -sfn "$old_release" "$current.next"
    mv -Tf "$current.next" "$current"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
}
trap rollback ERR

cp "$candidate" "$config"
nginx -t
ln -sfn "$release" "$current.next"
mv -Tf "$current.next" "$current"
activated=1
systemctl reload nginx

curl -fsS --noproxy '*' --resolve kadonext.com:443:127.0.0.1 -H 'Accept-Language: ru-RU' https://kadonext.com/ -o /tmp/kadonext-root-ru-__ID__.html
curl -fsS --noproxy '*' --resolve kadonext.com:443:127.0.0.1 -H 'Accept-Language: en-US' https://kadonext.com/ -o /tmp/kadonext-root-en-__ID__.html
grep -q 'lang="ru"' /tmp/kadonext-root-ru-__ID__.html
grep -q 'lang="en"' /tmp/kadonext-root-en-__ID__.html

trap - ERR
rm -f "$archive" "$candidate" "$backup" /tmp/kadonext-root-ru-__ID__.html /tmp/kadonext-root-en-__ID__.html
'@
  $activateCommand = $activateCommand.Replace('__RELEASE__', $releasePath).Replace('__ARCHIVE__', $remoteArchive).Replace('__NGINX__', $remoteNginxConfig).Replace('__ID__', $releaseId)

  Write-Host 'Activating release atomically...'
  $activateCommand | & ssh @sshArguments $remoteHost 'bash -se'
  if ($LASTEXITCODE -ne 0) {
    throw "Release activation failed with exit code $LASTEXITCODE."
  }

  $projectsHtml = (& curl.exe -fsS 'https://kadonext.com/ru/projects/') -join "`n"
  if ($LASTEXITCODE -ne 0 -or $projectsHtml -notmatch '(?:https://[^/]+)?/fonts/fixel/FixelVariable\.woff2|https://nfb4tt2jyb\.cdn\.twcstorage\.ru/_nuxt/') {
    throw 'Production health check failed: /ru/projects does not contain a static asset URL.'
  }

  $fontStatus = (& curl.exe -sS -o NUL -w '%{http_code}' 'https://kadonext.com/fonts/fixel/FixelVariable.woff2').Trim()
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
