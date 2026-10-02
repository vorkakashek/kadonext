param(
  [string]$RemoteHost = 'root@185.240.103.224'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$updateScript = Join-Path $repositoryRoot 'ops\analytics\update-dbip-country.sh'
$serviceFile = Join-Path $repositoryRoot 'ops\systemd\kado-geoip-update.service'
$timerFile = Join-Path $repositoryRoot 'ops\systemd\kado-geoip-update.timer'
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')

foreach ($path in @($sshKey, $updateScript, $serviceFile, $timerFile)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing analytics setup file: $path"
  }
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$remoteUpdate = "/tmp/kado-update-geoip-$stamp"
$remoteService = "/tmp/kado-geoip-update-$stamp.service"
$remoteTimer = "/tmp/kado-geoip-update-$stamp.timer"

& scp @sshArguments $updateScript "${RemoteHost}:$remoteUpdate"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the GeoIP updater.' }
& scp @sshArguments $serviceFile "${RemoteHost}:$remoteService"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the GeoIP service.' }
& scp @sshArguments $timerFile "${RemoteHost}:$remoteTimer"
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the GeoIP timer.' }

$remoteCommand = @(
  'set -eu'
  'DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libnginx-mod-http-geoip2'
  "install -o root -g root -m 0755 '$remoteUpdate' /usr/local/sbin/kado-update-geoip"
  "install -o root -g root -m 0644 '$remoteService' /etc/systemd/system/kado-geoip-update.service"
  "install -o root -g root -m 0644 '$remoteTimer' /etc/systemd/system/kado-geoip-update.timer"
  "rm -f '$remoteUpdate' '$remoteService' '$remoteTimer'"
  'systemctl daemon-reload'
  'install -d -o root -g root -m 0755 /var/lib/GeoIP'
  'systemctl start kado-geoip-update.service'
  'systemctl enable --now kado-geoip-update.timer'
  'systemctl is-active --quiet kado-geoip-update.timer'
  'test -s /var/lib/GeoIP/dbip-country-lite.mmdb'
  'nginx -t'
) -join '; '

& ssh @sshArguments $RemoteHost $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Could not configure production analytics (exit code $LASTEXITCODE)."
}

Write-Host 'Production analytics GeoIP support is configured.'
