$ErrorActionPreference = 'Stop'

# Read-only server diagnostics. Run this manually from a working SSH route.
$sshKey = Join-Path $env:USERPROFILE '.ssh\kado_codex_ed25519'
if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) {
  throw "Missing production SSH key: $sshKey"
}

$diagnostics = @'
set -u
printf '\n--- Server UTC ---\n'
date -u
printf '\n--- Certificate configured for kadonext.com (on disk) ---\n'
openssl x509 -in /etc/letsencrypt/live/kadonext.com/fullchain.pem -noout -subject -issuer -dates || true
printf '\n--- Certificate currently served by nginx ---\n'
timeout 12 openssl s_client -connect 127.0.0.1:443 -servername kadonext.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates || true
printf '\n--- Strict HTTPS check of local nginx ---\n'
if curl -fsSI --connect-timeout 5 --max-time 15 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/; then
  printf 'Origin TLS: OK\n'
else
  printf 'Origin TLS/HTTP check failed: %s\n' "$?"
fi
printf '\n--- Strict HTTPS check of VPS assets ---\n'
if curl -fsSI --connect-timeout 5 --max-time 15 --noproxy '*' --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/fonts/fixel/FixelCritical.woff2; then
  printf 'VPS assets TLS: OK\n'
else
  printf 'VPS asset TLS/HTTP check failed: %s\n' "$?"
fi
printf '\n--- Certificate renewal timers ---\n'
systemctl list-timers --all --no-pager | grep -Ei 'certbot|letsencrypt|acme' || true
printf '\n--- Active release after the failed deployment ---\n'
readlink -f /var/www/kadonext/current
'@

$diagnostics.Replace("`r`n", "`n") | & ssh -i $sshKey -o BatchMode=yes -o ConnectTimeout=10 root@185.240.103.224 'bash -s'
if ($LASTEXITCODE -ne 0) {
  throw "TLS diagnostics could not finish (SSH exit code $LASTEXITCODE)."
}
