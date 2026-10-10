#!/usr/bin/env bash
# Masalım — günlük yedek. Cron: deploy/masalim-backup.cron → /etc/cron.d/masalim-backup
# (deploy workflow kurar). Elle: sudo /opt/masalim/app/deploy/backup.sh
#
#   Veritabanı : pg_dump (custom format, sıkıştırılmış) → $BACKUP_DIR/db/masalim-YYYY-MM-DD.dump
#   Medya      : MinIO bucket'ı $BACKUP_DIR/media/mirror içine aynalanır (mc mirror; bucket'ta
#                silinen dosya aynadan da silinir) ve her gün hard-link kopyası
#                $BACKUP_DIR/media/snapshots/YYYY-MM-DD alınır (cp -al — değişmeyen dosyalar
#                ek yer kaplamaz; nesneler yazıldıktan sonra değişmediği için güvenlidir).
#   Saklama    : KEEP_DAYS (vars. 14) günden eski dump ve snapshot'lar silinir.
#   Çıkış kodu : 0 başarı; ≠0 herhangi bir adım başarısız (log: /var/log/masalim-backup.log).
#
#   backup.sh          → yedek al
#   backup.sh --check  → son dump 26 saatten yeni ve boş değil, bugünün/dünün snapshot'ı var (0/2)
#
# Ortam değişkenleriyle özelleştirme (yerel deneme için): BACKUP_DIR, KEEP_DAYS, PG_DUMP_CMD,
# MEDIA_MODE=mc|dir|skip, MEDIA_SOURCE_DIR (dir modunda kaynak klasör), COMPOSE_CMD.
set -euo pipefail

BASE="${MASALIM_BASE:-/opt/masalim}"
BACKUP_DIR="${BACKUP_DIR:-$BASE/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose -f $BASE/app/deploy/docker-compose.server.yml --project-directory $BASE}"
PG_DUMP_CMD="${PG_DUMP_CMD:-$COMPOSE_CMD exec -T postgres pg_dump -U masalim -Fc masalim}"
MEDIA_MODE="${MEDIA_MODE:-mc}"
MEDIA_SOURCE_DIR="${MEDIA_SOURCE_DIR:-}"
MEDIA_BUCKET="${MEDIA_BUCKET:-masalim-media}"
TODAY="$(date +%F)"

log() { printf '%s backup: %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "HATA: $*"; exit 1; }
trap 'log "HATA: satır ${LINENO} başarısız oldu"' ERR

check() {
  local newest age size
  newest="$(ls -1t "$BACKUP_DIR"/db/*.dump 2>/dev/null | head -n1 || true)"
  [ -n "$newest" ] || { log "KONTROL: hiç veritabanı dökümü yok ($BACKUP_DIR/db)"; exit 2; }
  age=$(( $(date +%s) - $(stat -c %Y "$newest") ))
  size=$(stat -c %s "$newest")
  if [ "$age" -gt $((26 * 3600)) ]; then
    log "KONTROL: son döküm $((age / 3600)) saat eski ($newest)"
    exit 2
  fi
  if [ "$size" -lt 1024 ]; then
    log "KONTROL: son döküm şüpheli küçük (${size} B)"
    exit 2
  fi
  if [ "$MEDIA_MODE" != skip ]; then
    local yday
    yday="$(date -d yesterday +%F)"
    if [ ! -d "$BACKUP_DIR/media/snapshots/$TODAY" ] && [ ! -d "$BACKUP_DIR/media/snapshots/$yday" ]; then
      log "KONTROL: medya snapshot'ı yok (bugün/dün)"
      exit 2
    fi
  fi
  log "KONTROL: tamam — $newest (${size} B, $((age / 60)) dk önce)"
}

if [ "${1:-}" = "--check" ]; then
  check
  exit 0
fi

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media/mirror" "$BACKUP_DIR/media/snapshots"
chmod 700 "$BACKUP_DIR"

# 1. Veritabanı — önce .tmp'ye yaz, başarılıysa yerine koy.
DUMP="$BACKUP_DIR/db/masalim-$TODAY.dump"
log "veritabanı dökümü → $DUMP"
# shellcheck disable=SC2086
$PG_DUMP_CMD > "$DUMP.tmp"
[ -s "$DUMP.tmp" ] || fail "pg_dump boş çıktı verdi"
mv -f "$DUMP.tmp" "$DUMP"

# 2. Medya aynası.
case "$MEDIA_MODE" in
  mc)
    log "medya aynalama (mc mirror local/$MEDIA_BUCKET)"
    # minio-init imajında mc var; .env'deki MINIO_ROOT_* compose'dan gelir.
    # shellcheck disable=SC2086
    $COMPOSE_CMD run --rm --no-deps --entrypoint /bin/sh \
      -v "$BACKUP_DIR/media/mirror:/backup" minio-init \
      -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite --remove local/'"$MEDIA_BUCKET"' /backup'
    ;;
  dir)
    [ -n "$MEDIA_SOURCE_DIR" ] || fail "MEDIA_MODE=dir için MEDIA_SOURCE_DIR gerekli"
    log "medya aynalama (rsync $MEDIA_SOURCE_DIR)"
    rsync -a --delete "$MEDIA_SOURCE_DIR/" "$BACKUP_DIR/media/mirror/"
    ;;
  skip)
    log "medya atlandı (MEDIA_MODE=skip)"
    ;;
  *)
    fail "MEDIA_MODE geçersiz: $MEDIA_MODE (mc | dir | skip)"
    ;;
esac

if [ "$MEDIA_MODE" != skip ]; then
  SNAP="$BACKUP_DIR/media/snapshots/$TODAY"
  rm -rf "$SNAP.tmp"
  cp -al "$BACKUP_DIR/media/mirror" "$SNAP.tmp"
  rm -rf "$SNAP"
  mv "$SNAP.tmp" "$SNAP"
fi

# 3. Eski yedekleri sil.
find "$BACKUP_DIR/db" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/media/snapshots" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

log "tamam — db $(du -h "$DUMP" | cut -f1), medya $(du -sh "$BACKUP_DIR/media/mirror" 2>/dev/null | cut -f1), toplam $(du -sh "$BACKUP_DIR" | cut -f1)"
