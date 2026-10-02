#!/bin/sh
set -eu

destination=/var/lib/GeoIP/dbip-country-lite.mmdb
version_file=/var/lib/GeoIP/dbip-country-lite.version
archive=$(mktemp /tmp/kado-geoip.XXXXXX.mmdb.gz)
database=$(mktemp /tmp/kado-geoip.XXXXXX.mmdb)
trap 'rm -f "$archive" "$database"' EXIT HUP INT TERM

current_month=$(date -u +%Y-%m)
previous_month=$(date -u -d '1 month ago' +%Y-%m)
downloaded=0

if [ -s "$destination" ] && [ -f "$version_file" ] \
  && [ "$(cat "$version_file")" = "$current_month" ]; then
  echo "DB-IP Country Lite for $current_month is already installed."
  exit 0
fi

for month in "$current_month" "$previous_month"; do
  url="https://download.db-ip.com/free/dbip-country-lite-$month.mmdb.gz"
  if curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 300 "$url" -o "$archive"; then
    downloaded=1
    break
  fi
done

if [ "$downloaded" -ne 1 ]; then
  echo 'Could not download the current or previous DB-IP Country Lite database.' >&2
  exit 1
fi

gzip -t "$archive"
gzip -dc "$archive" > "$database"
test -s "$database"

if [ -f "$destination" ] && cmp -s "$database" "$destination"; then
  echo 'DB-IP Country Lite is already current.'
  exit 0
fi

install -d -o root -g root -m 0755 /var/lib/GeoIP
install -o root -g root -m 0644 "$database" "$destination"
printf '%s\n' "$month" > "$version_file"
chown root:root "$version_file"
chmod 0644 "$version_file"

if nginx -t; then
  systemctl reload nginx
else
  echo 'GeoIP database updated, but nginx configuration is invalid; nginx was not reloaded.' >&2
  exit 1
fi

echo "Installed DB-IP Country Lite for $month."
