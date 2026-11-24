set -euo pipefail
umask 077

login=$(printf '%s' "$encoded_login" | base64 -d)
unset encoded_login
[[ "$login" =~ ^[A-Za-z0-9][A-Za-z0-9@._+-]{0,253}$ ]] || exit 1
password=$(printf '%s' "$encoded_password" | base64 -d)
unset encoded_password
hash=$(printf '%s\n' "$password" | openssl passwd -6 -stdin)
authorization=$(printf '%s:%s' "$login" "$password" | base64 -w 0)
unset password

exec 9>/run/lock/kadonext-nginx.lock
flock -x 9
config=$(readlink -e /etc/nginx/sites-enabled/kadonext)
credentials='/etc/nginx/kado-analytics.htpasswd'
work=$(mktemp -d /etc/nginx/.kado-analytics.XXXXXX)
config_changed=0
credentials_changed=0

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    if [ "$credentials_changed" = 1 ]; then
      if [ -e "$work/previous-password" ]; then
        mv -f "$work/previous-password" "$credentials"
      else
        rm -f "$credentials"
      fi
    fi
    if [ "$config_changed" = 1 ]; then
      mv -f "$work/previous-config" "$config"
      nginx -t && systemctl reload nginx
    fi
  fi
  rm -f -- "$work/password" "$work/config" "$work/previous-password" "$work/previous-config"
  rmdir -- "$work"
}
trap cleanup EXIT

if [ -e "$credentials" ]; then
  cp -p "$credentials" "$work/previous-password"
fi
printf '%s:%s\n' "$login" "$hash" > "$work/password"
chown root:www-data "$work/password"
chmod 0640 "$work/password"
credentials_changed=1
mv -f "$work/password" "$credentials"

legacy_include='^[[:space:]]*include /etc/nginx/snippets/kado-analytics-access\.conf;[[:space:]]*$'
if grep -qE "$legacy_include" "$config"; then
  test "$(grep -cE "$legacy_include" "$config")" -eq 1
  cp -p "$config" "$work/previous-config"
  cp -p "$config" "$work/config"
  sed -E "s|$legacy_include|        auth_basic \"KADO Analytics\";\n        auth_basic_user_file $credentials;|" "$config" > "$work/config"
  config_changed=1
  mv -f "$work/config" "$config"
  nginx -t
  systemctl reload nginx
fi

if grep -Fq 'location ^~ /analytics/ {' "$config"; then
  probe() {
    curl -sS --noproxy '*' --resolve kadonext.com:443:127.0.0.1 \
      --max-time 5 -o /dev/null -w '%{http_code}' "$@"
  }
  base='https://kadonext.com/analytics/'
  for attempt in 1 2 3 4 5; do
    if [ "$(probe "$base")" = 401 ] &&
       [ "$(probe "${base}report-7.json")" = 401 ] &&
       [ "$(printf 'Authorization: Basic %s\n' "$authorization" | probe -H @- "$base")" = 200 ] &&
       [ "$(printf 'Authorization: Basic %s\n' "$authorization" | probe -H @- "${base}report-7.json")" = 200 ]; then
      printf 'Analytics login verified for %s at %s\n' "$login" "$base"
      exit 0
    fi
    sleep 1
  done
  echo 'Analytics login verification failed. Restoring the previous access settings.' >&2
  exit 1
fi

echo 'Analytics password stored for the initial dashboard setup.'
exit 0
