#!/usr/bin/env bash
set -euo pipefail

for tool in certbot nginx systemctl openssl curl; do
  command -v "$tool" >/dev/null || { printf 'Required command is missing: %s\n' "$tool" >&2; exit 1; }
done

printf '\nServer UTC: '
date -u
printf '\nKADO certificate before renewal:\n'
openssl x509 -in /etc/letsencrypt/live/kadonext.com/fullchain.pem -noout -subject -dates
nginx -t

# Renew only this existing certificate, using its saved validation settings.
# Certbot skips issuance when the certificate on disk is already current.
certbot renew --cert-name kadonext.com --non-interactive
nginx -t
systemctl reload nginx

printf '\nKADO certificate after renewal:\n'
openssl x509 -in /etc/letsencrypt/live/kadonext.com/fullchain.pem -noout -subject -dates
printf '\nChecking HTTPS served by local nginx...\n'
curl -fsS --connect-timeout 10 --max-time 30 --noproxy '*' \
  --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/ -o /dev/null
printf 'Origin HTTPS: OK\n'

printf '\nChecking VPS font delivery...\n'
curl -fsS --connect-timeout 10 --max-time 30 --noproxy '*' \
  --resolve kadonext.com:443:127.0.0.1 https://kadonext.com/fonts/fixel/FixelCritical.woff2 -o /dev/null
printf 'VPS assets HTTPS: OK\n'
