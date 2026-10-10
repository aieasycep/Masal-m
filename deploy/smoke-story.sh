#!/usr/bin/env bash
# Canlı API'de uçtan uca masal üretimi: giriş (ya da ilk seferde kayıt) →
# KISA masal → generate → iş bitene dek bekle → başlık / sayfa sayısı.
# GERÇEK LLM çağrısı yapar (sağlayıcı kredisi harcar). Kullanım:
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... bash deploy/smoke-story.sh https://api.57-129-6-57.sslip.io
# SMOKE_EMAIL/SMOKE_PASSWORD verilmezse tek seferlik bir hesap açılır (yalnızca
# lokal/mock sunucularda — canlıda sabit hesap kullanın ki çöp hesap birikmesin).
set -euo pipefail

BASE="${1:?API adresi gerekli, örn. https://api.57-129-6-57.sslip.io}"
EMAIL="${SMOKE_EMAIL:-smoke-$(date +%s)@masalim.local}"
PASSWORD="${SMOKE_PASSWORD:-smoke-pass-1}"
APP_VERSION="${SMOKE_APP_VERSION:-0.1.0}"
# JSON alanı okur; eksik/bozuk yanıtta boş döner (asla betiği düşürmez).
J() { python3 -c "import sys,json
try:
  v=json.load(sys.stdin)$1
  print('' if v is None else v)
except Exception:
  print('')"; }
H=(-H 'content-type: application/json' -H "x-app-version: $APP_VERSION")
fail() { echo "::error::$1"; exit 1; }

echo "→ giriş: $EMAIL"
LOGIN=$(curl -sS --max-time 30 -X POST "$BASE/auth/login" "${H[@]}" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" || true)
TOKEN=$(echo "$LOGIN" | J "['tokens']['accessToken']")
if [ -z "$TOKEN" ]; then
  echo "→ hesap yok, kayıt: $EMAIL"
  REG=$(curl -sS --max-time 30 -X POST "$BASE/auth/register" "${H[@]}" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke\",\"locale\":\"tr\"}" || true)
  TOKEN=$(echo "$REG" | J "['tokens']['accessToken']")
  [ -n "$TOKEN" ] || fail "giriş/kayıt başarısız: $(echo "$REG" | head -c 300)"
fi
AUTH=(-H "Authorization: Bearer $TOKEN" -H "x-app-version: $APP_VERSION")

echo "→ KISA masal taslağı"
STORY=$(curl -sS --max-time 30 -X POST "${AUTH[@]}" "$BASE/stories" -H 'content-type: application/json' -d '{
  "childId": null, "heroName": "Ege", "heroType": "CHILD", "themes": ["SLEEP"],
  "ageRange": "AGE_3_5", "durationTarget": "SHORT", "advanced": {}, "language": "tr"}' || true)
SID=$(echo "$STORY" | J "['id']")
[ -n "$SID" ] || fail "masal taslağı oluşturulamadı: $(echo "$STORY" | head -c 300)"

echo "→ üretim başlatılıyor"
GEN=$(curl -sS --max-time 60 -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke-$SID" "$BASE/stories/$SID/generate" || true)
JOB=$(echo "$GEN" | J "['jobId']")
[ -n "$JOB" ] || fail "generate başarısız: $(echo "$GEN" | head -c 300)"

STATUS=""
for _ in $(seq 1 90); do
  JOB_JSON=$(curl -sS --max-time 30 "${AUTH[@]}" "$BASE/jobs/$JOB" || true)
  STATUS=$(echo "$JOB_JSON" | J "['status']")
  PROGRESS=$(echo "$JOB_JSON" | J "['progress']")
  echo "  iş: ${STATUS:-?} (${PROGRESS:-?}%)"
  case "$STATUS" in
    SUCCEEDED|FAILED|CANCELLED) break ;;
  esac
  sleep 5
done
[ "$STATUS" = "SUCCEEDED" ] || fail "masal işi bitmedi/başarısız: ${STATUS:-yanıt yok} — $(echo "$JOB_JSON" | head -c 300)"

DETAIL=$(curl -sS --max-time 30 "${AUTH[@]}" "$BASE/stories/$SID" || true)
echo "$DETAIL" | python3 -c '
import sys, json
d = json.load(sys.stdin)
pages = d.get("pages") or []
words = sum(len((p.get("text") or "").split()) for p in pages)
title = d.get("title")
status = d.get("status")
moderation = d.get("moderationStatus")
summary = (d.get("summary") or "")[:200]
first = (pages[0].get("text") or "")[:200] if pages else "(yok)"
print(f"✓ masal hazır: \"{title}\" — {len(pages)} sayfa, {words} kelime, durum {status}/{moderation}")
print("  özet:", summary)
print("  1. sayfa:", first)
' || fail "masal detayı okunamadı: $(echo "$DETAIL" | head -c 300)"
