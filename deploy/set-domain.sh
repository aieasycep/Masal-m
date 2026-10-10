#!/usr/bin/env bash
# Masalım — /opt/masalim/.env içindeki alan adına bağlı satırları günceller.
# .env yalnızca ilk kurulumda üretilir (deploy/remote-setup.sh); alan adı sonradan
# değişirse (GitHub repo değişkeni MASALIM_DOMAIN) deploy workflow bu betiği her
# dağıtımda çalıştırır. İdempotent: değer aynıysa dosyaya dokunmaz.
set -euo pipefail

DOMAIN="${1:?kullanım: set-domain.sh <alan-adı>}"
ENV_FILE="${ENV_FILE:-/opt/masalim/.env}"

[ -f "$ENV_FILE" ] || { echo "set-domain: $ENV_FILE yok"; exit 1; }

set_kv() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i -E "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

before="$(sha256sum "$ENV_FILE" | cut -c1-16)"
set_kv MASALIM_DOMAIN "$DOMAIN"
set_kv API_PUBLIC_URL "https://api.${DOMAIN}"
set_kv CORS_ORIGINS "https://admin.${DOMAIN}"
set_kv STORAGE_ENDPOINT "https://storage.${DOMAIN}"
after="$(sha256sum "$ENV_FILE" | cut -c1-16)"

if [ "$before" = "$after" ]; then
  echo "set-domain: değişiklik yok (${DOMAIN})"
else
  echo "set-domain: .env alan adı satırları güncellendi → ${DOMAIN}"
fi
