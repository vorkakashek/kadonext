#!/usr/bin/env bash
set -euo pipefail
tools="$1"
id="$2"
[[ "$id" =~ ^vps-[0-9]{14}$ ]]
current=/var/www/kadonext/current
release="/var/www/kadonext/releases/$id"
exec 9>/run/lock/kadonext-nginx.lock
flock -x 9
old_release=$(readlink -f "$current")
[[ "$old_release" == /var/www/kadonext/releases/* ]]
test ! -e "$release"
nginx -t
cp -a "$old_release" "$release"
node "$tools/migrate-static-origin.mjs" "$release" "$id"
node "$tools/check-origin-assets.mjs" "$release"
# The new namespace avoids changing existing immutable URLs or old releases.
test ! -e "/var/www/kadonext/shared-assets/_nuxt/$id"
cp -a "$release/_nuxt/$id" "/var/www/kadonext/shared-assets/_nuxt/$id"
rollback() {
  status=$?
  ln -sfn "$old_release" "$current.next"
  mv -Tf "$current.next" "$current"
  printf 'Rolled back to %s\n' "$old_release" >&2
  exit "$status"
}
trap rollback ERR
ln -sfn "$release" "$current.next"
mv -Tf "$current.next" "$current"
for path in / /ru/ /en/ /ru/projects/ /en/projects/ /robots.txt /sitemap.xml /fonts/fixel/FixelCritical.woff2 /api/contact; do
  curl -fsS --connect-timeout 10 --max-time 30 --noproxy '*' \
    --resolve kadonext.com:443:127.0.0.1 "https://kadonext.com$path" -o /dev/null
done
# Check compressed responses as well as the exact migrated module entry.
entry=$(grep -oE 'src="/_nuxt/[^" ]+\.js"' "$release/ru/index.html" | head -n 1 | cut -d '"' -f 2)
test -n "$entry"
for path in /ru/ /en/ "$entry"; do
  response=$(curl -fsS --compressed --connect-timeout 10 --max-time 30 --noproxy '*' \
    --resolve kadonext.com:443:127.0.0.1 "https://kadonext.com$path")
  if [[ "$response" == *twcstorage.ru* ]]; then false; fi
done
trap - ERR
printf 'VPS migration complete: %s\nPrevious release retained: %s\n' "$release" "$old_release"
