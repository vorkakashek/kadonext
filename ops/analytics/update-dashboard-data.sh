#!/usr/bin/env bash
set -euo pipefail

reporter='/usr/local/lib/kado-analytics/report-analytics.mjs'
destination='/var/lib/kado-analytics/www/analytics'

install -d -o root -g www-data -m 0750 "$destination"

temporary_files=()
cleanup() {
  for path in "${temporary_files[@]:-}"; do
    rm -f "$path"
  done
}
trap cleanup EXIT

for days in 7 30 90; do
  temporary=$(mktemp "/var/lib/kado-analytics/report-${days}.XXXXXX")
  temporary_files+=("$temporary")
  node "$reporter" --dir /var/log/nginx --days "$days" --json > "$temporary"
  node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$temporary"
  install -o root -g www-data -m 0640 "$temporary" "$destination/report-${days}.json"
done
