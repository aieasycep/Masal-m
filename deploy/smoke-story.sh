#!/usr/bin/env bash
# Canlı API'de uçtan uca masal üretimi: kayıt (6 kredi hediye) → KISA masal →
# generate → iş bitene dek bekle → başlık / sayfa sayısı / çizim yönergesi.
# GERÇEK LLM çağrısı yapar (sağlayıcı kredisi harcar). Kullanım:
#   bash deploy/smoke-story.sh https://api.57-129-6-57.sslip.io
set -euo pipefail

BASE="${1:?API adresi gerekli, örn. https://api.57-129-6-57.sslip.io}"
EMAIL="smoke-$(date +%s)@masalim.local"
APP_VERSION="${SMOKE_APP_VERSION:-0.1.0}"
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "→ kayıt: $EMAIL"
REG=$(curl -sS -X POST "$BASE/auth/register" -H 'content-type: application/json' \
  -H "x-app-version: $APP_VERSION" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoke-pass-1\",\"name\":\"Smoke\",\"locale\":\"tr\"}")
TOKEN=$(echo "$REG" | J "['tokens']['accessToken']" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo "::error::kayıt başarısız: $(echo "$REG" | head -c 400)"
  exit 1
fi
AUTH=(-H "Authorization: Bearer $TOKEN" -H "x-app-version: $APP_VERSION")

echo "→ KISA masal taslağı"
STORY=$(curl -sS -X POST "${AUTH[@]}" "$BASE/stories" -H 'content-type: application/json' -d '{
  "childId": null, "heroName": "Ege", "heroType": "CHILD", "themes": ["SLEEP"],
  "ageRange": "AGE_3_5", "durationTarget": "SHORT", "advanced": {}, "language": "tr"}')
SID=$(echo "$STORY" | J "['id']" 2>/dev/null || true)
if [ -z "$SID" ]; then
  echo "::error::masal taslağı oluşturulamadı: $(echo "$STORY" | head -c 400)"
  exit 1
fi

echo "→ üretim başlatılıyor"
GEN=$(curl -sS -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke-$SID" "$BASE/stories/$SID/generate")
JOB=$(echo "$GEN" | J "['jobId']" 2>/dev/null || true)
if [ -z "$JOB" ]; then
  echo "::error::generate başarısız: $(echo "$GEN" | head -c 400)"
  exit 1
fi

STATUS=""
for _ in $(seq 1 90); do
  JOB_JSON=$(curl -sS "${AUTH[@]}" "$BASE/jobs/$JOB")
  STATUS=$(echo "$JOB_JSON" | J "['status']")
  PROGRESS=$(echo "$JOB_JSON" | J "['progress']")
  echo "  iş: $STATUS ($PROGRESS%)"
  case "$STATUS" in
    SUCCEEDED|FAILED|CANCELLED) break ;;
  esac
  sleep 5
done

if [ "$STATUS" != "SUCCEEDED" ]; then
  echo "::error::masal işi bitmedi/başarısız: $STATUS — $(curl -sS "${AUTH[@]}" "$BASE/jobs/$JOB" | head -c 400)"
  exit 1
fi

DETAIL=$(curl -sS "${AUTH[@]}" "$BASE/stories/$SID")
echo "$DETAIL" | python3 -c '
import sys, json
d = json.load(sys.stdin)
pages = d.get("pages", [])
words = sum(len(p["text"].split()) for p in pages)
print(f"✓ masal hazır: \"{d.get(\"title\")}\" — {len(pages)} sayfa, {words} kelime, durum {d.get(\"status\")}/{d.get(\"moderationStatus\")}")
print("  özet:", (d.get("summary") or "")[:200])
print("  1. sayfa:", pages[0]["text"][:200] if pages else "(yok)")
'
