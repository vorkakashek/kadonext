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

if (-not (Test-Path (Join-Path $publicDirectory 'ru\projects\index.html'))) {
  throw 'Missing prerendered /ru/projects page in .output/public.'
}
if (-not (Test-Path (Join-Path $publicDirectory 'index.html'))) {
  throw 'Missing cacheable root locale selector. Run npm run build first.'
}
foreach ($seoFile in @('robots.txt', 'sitemap.xml')) {
  $seoPath = Join-Path $publicDirectory $seoFile
  if (-not (Test-Path -LiteralPath $seoPath -PathType Leaf) -or (Get-Item -LiteralPath $seoPath).Length -eq 0) {
    throw "Missing or empty $seoFile. Run npm run build first."
  }
}
$sidequestReleaseFiles = @(
  'ru/projects/sidequest/index.html',
  'en/projects/sidequest/index.html',
  'ru/projects/sidequest/interactive/index.html',
  'en/projects/sidequest/interactive/index.html',
  'experiments/sidequest/index.html',
  'experiments/sidequest/main.js',
  'experiments/sidequest/interaction.js',
  'experiments/sidequest/polygons.js',
  'experiments/sidequest/scene-geometry.js',
  'experiments/sidequest/pathfinding.js',
  'experiments/sidequest/radio.js',
  'experiments/sidequest/style.css',
  'experiments/sidequest/playthings.css',
  'experiments/sidequest/audio/field-radio.mp3',
  'experiments/sidequest/audio/LICENSE.txt',
  'experiments/sidequest/fonts/FixelVariable.woff2',
  'home/cases/sidequest/scene.webp',
  'og/v2/sidequest.jpg'
)
foreach ($sidequestFile in $sidequestReleaseFiles) {
  $sidequestFullPath = Join-Path $publicDirectory $sidequestFile
  if (-not (Test-Path -LiteralPath $sidequestFullPath -PathType Leaf) -or (Get-Item -LiteralPath $sidequestFullPath).Length -eq 0) {
    throw "Missing or empty SIDEQUEST release file: $sidequestFile. Run npm run build first."
  }
}
if (-not (Test-Path $sshKey)) {
  throw "Missing production SSH key: $sshKey"
}
if (-not (Test-Path $nginxConfig)) {
  throw "Missing production nginx config: $nginxConfig"
}

# Also gate -SkipBuild: an old CDN build must never be published again.
& node scripts/check-origin-assets.mjs
if ($LASTEXITCODE -ne 0) {
  throw 'Origin asset validation failed. Run npm run build before deployment.'
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
shared_nuxt='/var/www/kadonext/shared-assets/_nuxt'
backup='/tmp/kadonext-nginx-__ID__.backup'
exec 9>/run/lock/kadonext-nginx.lock
flock -x 9
old_release=$(readlink -f "$current")
activated=0

tar -xzf "$archive" -C "$release"
test -f "$release/index.html"
test -f "$release/ru/projects/index.html"
test -s "$release/robots.txt"
test -s "$release/sitemap.xml"
if ! test -s /etc/nginx/kado-analytics.htpasswd; then
  echo 'Set the dashboard password with npm run analytics:dashboard:password before deployment.' >&2
  exit 1
fi
test -s "$release/ru/projects/sidequest/index.html"
test -s "$release/en/projects/sidequest/index.html"
test -s "$release/ru/projects/sidequest/interactive/index.html"
test -s "$release/en/projects/sidequest/interactive/index.html"
test -s "$release/experiments/sidequest/audio/field-radio.mp3"
grep -q 'data-kado-locale-selector' "$release/index.html"
test -f "$release/fonts/fixel/FixelVariable.woff2"
cp "$config" "$backup"

rollback() {
  local status=$?
  cp "$backup" "$config"
  if [ "$activated" = 1 ]; then
    ln -sfn "$old_release" "$current.next"
    mv -Tf "$current.next" "$current"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  exit "$status"
}
trap rollback ERR

mkdir -p "$shared_nuxt"
if [ -d "$old_release/_nuxt" ]; then
  cp -a "$old_release/_nuxt/." "$shared_nuxt/"
fi
cp -a "$release/_nuxt/." "$shared_nuxt/"

cp "$candidate" "$config"
nginx -t
ln -sfn "$release" "$current.next"
mv -Tf "$current.next" "$current"
activated=1
systemctl reload nginx

curl -fsS --retry 10 --retry-delay 1 --retry-all-errors --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/ -o /tmp/kadonext-root-__ID__.html
grep -q 'data-kado-locale-selector' /tmp/kadonext-root-__ID__.html
grep -q '<html lang="en"' /tmp/kadonext-root-__ID__.html
grep -q 'name="description"' /tmp/kadonext-root-__ID__.html
grep -q 'property="og:image" content="https://[^" ]*/og/v2/home.jpg"' /tmp/kadonext-root-__ID__.html
if grep -qi 'select language' /tmp/kadonext-root-__ID__.html; then exit 1; fi
curl -fsS --retry 10 --retry-delay 1 --retry-all-errors --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/ru/ -o /tmp/kadonext-ru-__ID__.html
curl -fsS --retry 10 --retry-delay 1 --retry-all-errors --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/en/ -o /tmp/kadonext-en-__ID__.html
grep -q 'lang="ru"' /tmp/kadonext-ru-__ID__.html
grep -q 'lang="en"' /tmp/kadonext-en-__ID__.html
grep -q 'property="og:image" content="https://[^" ]*/og/v2/ru/home.jpg"' /tmp/kadonext-ru-__ID__.html
grep -q 'property="og:image" content="https://[^" ]*/og/v2/home.jpg"' /tmp/kadonext-en-__ID__.html

robots_type=$(curl -fsS --max-time 15 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 \
  -o /tmp/kadonext-robots-__ID__.txt -w '%{content_type}' https://kadonext.com/robots.txt)
[[ "$robots_type" == text/plain* ]]
cmp "$release/robots.txt" /tmp/kadonext-robots-__ID__.txt
rm -f /tmp/kadonext-robots-__ID__.txt
curl -fsS --max-time 15 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/sitemap.xml -o /dev/null

# A successful home-page response does not prove that the new case and its
# playable scene were shipped. Keep these checks inside the rollback trap.
for locale in ru en; do
  curl -fsS --connect-timeout 10 --max-time 30 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 "https://kadonext.com/$locale/projects/sidequest/" -o /tmp/kadonext-sidequest-__ID__.html
  grep -q 'SIDEQUEST' /tmp/kadonext-sidequest-__ID__.html
  grep -q "/$locale/projects/sidequest/interactive" /tmp/kadonext-sidequest-__ID__.html
  curl -fsS --connect-timeout 10 --max-time 30 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 "https://kadonext.com/$locale/projects/sidequest/interactive/" -o /tmp/kadonext-sidequest-__ID__.html
  grep -q 'src="/experiments/sidequest/index.html"' /tmp/kadonext-sidequest-__ID__.html
done
rm -f /tmp/kadonext-sidequest-__ID__.html

# Validate the exact entry and critical font on the VPS before committing.
app_path=$(grep -oE 'src="/_nuxt/[^" ]+\.js"' /tmp/kadonext-ru-__ID__.html | head -n 1 | cut -d '"' -f 2)
test -n "$app_path"
for asset_path in "$app_path" /fonts/fixel/FixelCritical.woff2; do
  curl -fsS --retry 5 --retry-delay 1 --retry-all-errors --connect-timeout 10 --max-time 60 \
    --noproxy '*' --resolve kadonext.com:443:127.0.0.1 "https://kadonext.com$asset_path" -o /dev/null
done

trap - ERR
rm -f "$archive" "$candidate" "$backup" /tmp/kadonext-root-__ID__.html /tmp/kadonext-ru-__ID__.html /tmp/kadonext-en-__ID__.html
exit 0
'@
  $activateCommand = $activateCommand.Replace('__RELEASE__', $releasePath).Replace('__ARCHIVE__', $remoteArchive).Replace('__NGINX__', $remoteNginxConfig).Replace('__ID__', $releaseId)

  Write-Host 'Activating release atomically...'
  $activateCommand.Replace("`r`n", "`n") | & ssh @sshArguments $remoteHost 'bash -se'
  if ($LASTEXITCODE -ne 0) {
    throw "Release activation failed with exit code $LASTEXITCODE."
  }

  $projectsHtml = (& curl.exe -fsS 'https://kadonext.com/ru/projects/') -join "`n"
  if ($LASTEXITCODE -ne 0 -or $projectsHtml -notmatch '(?:https://[^/]+)?/(?:fonts/fixel/FixelVariable\.woff2|_nuxt/)') {
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
