param(
  [Parameter(Mandatory = $true)]
  [string]$AllowedIp,
  [string]$RemoteHost = 'root@185.240.103.224'
)

$ErrorActionPreference = 'Stop'

$parsedIp = $null
if (-not [System.Net.IPAddress]::TryParse($AllowedIp, [ref]$parsedIp) -or $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
  throw "AllowedIp must be one IPv4 address, received: $AllowedIp"
}

$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
$nginxConfig = Join-Path $repositoryRoot 'ops\nginx\kadonext.conf'
$reporter = Join-Path $repositoryRoot 'scripts\report-analytics.mjs'
$updater = Join-Path $repositoryRoot 'ops\analytics\update-dashboard-data.sh'
$service = Join-Path $repositoryRoot 'ops\systemd\kado-analytics-dashboard.service'
$timer = Join-Path $repositoryRoot 'ops\systemd\kado-analytics-dashboard.timer'
$dashboard = Join-Path $repositoryRoot 'ops\analytics\dashboard'
$assets = @(
  (Join-Path $dashboard 'index.html'),
  (Join-Path $dashboard 'styles.css'),
  (Join-Path $dashboard 'app.js')
)
$required = @($sshKey, $nginxConfig, $reporter, $updater, $service, $timer) + $assets
foreach ($path in $required) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing dashboard setup file: $path" }
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$sshArguments = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10')
$uploads = @(
  @{ Local = $nginxConfig; Remote = "/tmp/kado-nginx-$stamp.conf" },
  @{ Local = $reporter; Remote = "/tmp/kado-reporter-$stamp.mjs" },
  @{ Local = $updater; Remote = "/tmp/kado-dashboard-update-$stamp" },
  @{ Local = $service; Remote = "/tmp/kado-dashboard-$stamp.service" },
  @{ Local = $timer; Remote = "/tmp/kado-dashboard-$stamp.timer" },
  @{ Local = $assets[0]; Remote = "/tmp/kado-dashboard-$stamp.html" },
  @{ Local = $assets[1]; Remote = "/tmp/kado-dashboard-$stamp.css" },
  @{ Local = $assets[2]; Remote = "/tmp/kado-dashboard-$stamp.js" }
)

foreach ($upload in $uploads) {
  & scp @sshArguments $upload.Local "${RemoteHost}:$($upload.Remote)"
  if ($LASTEXITCODE -ne 0) { throw "Could not upload $($upload.Local)." }
}

$remoteScript = @'
set -euo pipefail
allowed_ip='__ALLOWED_IP__'
stamp='__STAMP__'
config='/etc/nginx/sites-enabled/kadonext'
backup="/tmp/kadonext-nginx-${stamp}.backup"
candidate="/tmp/kado-nginx-${stamp}.conf"

cp "$config" "$backup"
rollback() {
  cp "$backup" "$config"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
}
trap rollback ERR

install -d -o root -g root -m 0755 /etc/nginx/snippets /usr/local/lib/kado-analytics
install -d -o root -g www-data -m 0750 /var/lib/kado-analytics/www/analytics
printf 'allow %s;\ndeny all;\n' "$allowed_ip" > "/tmp/kado-analytics-access-${stamp}.conf"
install -o root -g root -m 0644 "/tmp/kado-analytics-access-${stamp}.conf" /etc/nginx/snippets/kado-analytics-access.conf
install -o root -g root -m 0644 "/tmp/kado-reporter-${stamp}.mjs" /usr/local/lib/kado-analytics/report-analytics.mjs
install -o root -g root -m 0755 "/tmp/kado-dashboard-update-${stamp}" /usr/local/sbin/kado-update-analytics-dashboard
install -o root -g root -m 0644 "/tmp/kado-dashboard-${stamp}.service" /etc/systemd/system/kado-analytics-dashboard.service
install -o root -g root -m 0644 "/tmp/kado-dashboard-${stamp}.timer" /etc/systemd/system/kado-analytics-dashboard.timer
install -o root -g www-data -m 0640 "/tmp/kado-dashboard-${stamp}.html" /var/lib/kado-analytics/www/analytics/index.html
install -o root -g www-data -m 0640 "/tmp/kado-dashboard-${stamp}.css" /var/lib/kado-analytics/www/analytics/styles.css
install -o root -g www-data -m 0640 "/tmp/kado-dashboard-${stamp}.js" /var/lib/kado-analytics/www/analytics/app.js
cp "$candidate" "$config"

systemctl daemon-reload
systemctl start kado-analytics-dashboard.service
systemctl enable --now kado-analytics-dashboard.timer
systemctl is-active --quiet kado-analytics-dashboard.timer
test -s /var/lib/kado-analytics/www/analytics/report-7.json
test -s /var/lib/kado-analytics/www/analytics/report-30.json
test -s /var/lib/kado-analytics/www/analytics/report-90.json
nginx -t
systemctl reload nginx

trap - ERR
rm -f "$backup" "/tmp/kado-analytics-access-${stamp}.conf" \
  "/tmp/kado-reporter-${stamp}.mjs" "/tmp/kado-dashboard-update-${stamp}" \
  "/tmp/kado-dashboard-${stamp}.service" "/tmp/kado-dashboard-${stamp}.timer" \
  "/tmp/kado-dashboard-${stamp}.html" "/tmp/kado-dashboard-${stamp}.css" \
  "/tmp/kado-dashboard-${stamp}.js" "$candidate"
'@
$remoteScript = $remoteScript.Replace('__ALLOWED_IP__', $AllowedIp).Replace('__STAMP__', $stamp)
$remoteScript | & ssh @sshArguments $RemoteHost 'bash -se'
if ($LASTEXITCODE -ne 0) { throw "Could not configure the analytics dashboard (exit code $LASTEXITCODE)." }

Write-Host "Analytics dashboard configured for $AllowedIp at https://kadonext.com/analytics/"
