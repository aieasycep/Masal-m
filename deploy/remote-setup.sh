#!/usr/bin/env bash
# Masalım sunucu hazırlığı — deploy workflow her dağıtımda çalıştırır.
# İlk çalıştırmada /opt/masalim/.env dosyasını rastgele sırlarla üretir;
# sonraki çalıştırmalarda mevcut dosyaya DOKUNMAZ (sırlar sabit kalır).
set -euo pipefail

BASE=/opt/masalim
ENV_FILE="$BASE/.env"
DOMAIN_BASE="57-129-6-57.sslip.io"

mkdir -p "$BASE"

if [ ! -f "$ENV_FILE" ]; then
  PG_PASSWORD="$(openssl rand -hex 24)"
  MINIO_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET_VALUE="$(openssl rand -hex 32)"
  JWT_REFRESH_SECRET_VALUE="$(openssl rand -hex 32)"

  cat > "$ENV_FILE" <<EOF
# Masalım sunucu ortamı — deploy/remote-setup.sh tarafından üretildi.
# Bu dosya sunucuda kalır, git'e girmez. Alan adı değişikliğinde buradaki
# URL'ler + deploy/nginx-masalim.conf + compose'daki admin build arg birlikte
# güncellenir.
NODE_ENV=staging
API_PORT=3001
API_PUBLIC_URL=https://api.${DOMAIN_BASE}
CORS_ORIGINS=https://admin.${DOMAIN_BASE}

POSTGRES_USER=masalim
POSTGRES_PASSWORD=${PG_PASSWORD}
POSTGRES_DB=masalim
DATABASE_URL=postgresql://masalim:${PG_PASSWORD}@postgres:5432/masalim
REDIS_URL=redis://redis:6379

JWT_SECRET=${JWT_SECRET_VALUE}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET_VALUE}

STORAGE_PROVIDER=s3
STORAGE_BUCKET=masalim-media
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://storage.${DOMAIN_BASE}
STORAGE_FORCE_PATH_STYLE=true
STORAGE_ACCESS_KEY=masalim
STORAGE_SECRET_KEY=${MINIO_PASSWORD}
MINIO_ROOT_USER=masalim
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}

AI_PROVIDER=openai
AI_MODEL=gpt-4o
MODERATION_PROVIDER=openai
MODERATION_MODEL=gpt-4o-mini
TTS_PROVIDER=elevenlabs
VOICE_CLONE_PROVIDER=elevenlabs
IMAGE_PROVIDER=openai
IMAGE_MODEL=gpt-image-1

WORKER_MODE=inline
FFMPEG_PATH=/usr/bin/ffmpeg
CHROMIUM_PATH=/usr/bin/chromium
EOF
  chmod 600 "$ENV_FILE"
  echo "remote-setup: yeni .env üretildi."
else
  echo "remote-setup: mevcut .env korunuyor."
fi

# Sağlayıcı anahtarları dosyası — içeriğini deploy workflow GitHub
# Secrets'tan yazar; burada yalnızca var olması ve kilitli olması garanti edilir.
touch "$BASE/providers.env"
chmod 600 "$BASE/providers.env"

echo "remote-setup: tamam."
