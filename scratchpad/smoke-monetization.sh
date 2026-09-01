#!/usr/bin/env bash
# Monetization smoke: signup gift → offerings → credit spend by length →
# insufficient stop → pack purchase → spend from balance → refund on failure
# is covered by unit tests. Requires the API on :3001 with docker infra
# (mock providers) and a seeded DB.
set -euo pipefail
BASE=http://localhost:3001
EMAIL="credits-$(date +%s)@masalim.local"
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "→ register (gift beklenir: 6 kredi)"
REG=$(curl -sS -X POST "$BASE/auth/register" -H 'content-type: application/json' \
  -H 'x-app-version: 0.1.0' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"smoke-pass-1\",\"name\":\"Smoke\",\"locale\":\"tr\"}")
TOKEN=$(echo "$REG" | J "['tokens']['accessToken']")
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'x-app-version: 0.1.0')

ENT=$(curl -sS "${AUTH[@]}" "$BASE/subscription/entitlements")
echo "  entitlements: $ENT"
[ "$(echo "$ENT" | J "['credits']['balance']")" = "6" ] || { echo "FAIL gift"; exit 1; }
[ "$(echo "$ENT" | J "['credits']['quota']['limit']")" = "3" ] || { echo "FAIL quota limit"; exit 1; }

echo "→ offerings (FREE fiyatları beklenir)"
OFF=$(curl -sS "${AUTH[@]}" "$BASE/subscription/offerings")
echo "  offerings: $OFF"
echo "$OFF" | grep -q 'masalim_credits_6_std' || { echo "FAIL std packs"; exit 1; }
echo "$OFF" | grep -q '999.99' || { echo "FAIL sub price"; exit 1; }

echo "→ SHORT story (3 kredi: kota 3 → kota biter, bakiye 6 kalır)"
STORY=$(curl -sS -X POST "${AUTH[@]}" "$BASE/stories" -H 'content-type: application/json' -d '{
  "childId": null, "heroName": "Ege", "heroType": "CHILD", "themes": ["SLEEP"],
  "ageRange": "AGE_3_5", "durationTarget": "SHORT", "advanced": {}, "language": "tr"}')
SID=$(echo "$STORY" | J "['id']")
curl -sS -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke-$SID" "$BASE/stories/$SID/generate" > /dev/null
ENT=$(curl -sS "${AUTH[@]}" "$BASE/subscription/entitlements")
[ "$(echo "$ENT" | J "['credits']['quota']['used']")" = "3" ] || { echo "FAIL quota spend"; exit 1; }
[ "$(echo "$ENT" | J "['credits']['balance']")" = "6" ] || { echo "FAIL balance untouched"; exit 1; }
echo "  kota kullanıldı: 3/3, bakiye: 6 ✓"

echo "→ MEDIUM story (6 kredi: kota 0 → tamamı bakiyeden, bakiye 0)"
STORY=$(curl -sS -X POST "${AUTH[@]}" "$BASE/stories" -H 'content-type: application/json' -d '{
  "childId": null, "heroName": "Ege", "heroType": "CHILD", "themes": ["ADVENTURE"],
  "ageRange": "AGE_3_5", "durationTarget": "MEDIUM", "advanced": {}, "language": "tr"}')
SID2=$(echo "$STORY" | J "['id']")
curl -sS -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke-$SID2" "$BASE/stories/$SID2/generate" > /dev/null
ENT=$(curl -sS "${AUTH[@]}" "$BASE/subscription/entitlements")
[ "$(echo "$ENT" | J "['credits']['balance']")" = "0" ] || { echo "FAIL balance spend"; exit 1; }
echo "  bakiye harcandı: 0 ✓"

echo "→ üçüncü masal INSUFFICIENT_CREDITS vermeli"
STORY=$(curl -sS -X POST "${AUTH[@]}" "$BASE/stories" -H 'content-type: application/json' -d '{
  "childId": null, "heroName": "Ege", "heroType": "CHILD", "themes": ["SLEEP"],
  "ageRange": "AGE_3_5", "durationTarget": "SHORT", "advanced": {}, "language": "tr"}')
SID3=$(echo "$STORY" | J "['id']")
ERR=$(curl -sS -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke-$SID3" "$BASE/stories/$SID3/generate")
echo "$ERR" | grep -q 'INSUFFICIENT_CREDITS' || { echo "FAIL insufficient: $ERR"; exit 1; }
echo "  INSUFFICIENT_CREDITS ✓"

echo "→ 12'lik paket satın al (mock store) → bakiye 12"
curl -sS -X POST "${AUTH[@]}" "$BASE/subscription/mock/purchase" -H 'content-type: application/json' \
  -d '{"productId":"masalim_credits_12_std"}' > /dev/null
ENT=$(curl -sS "${AUTH[@]}" "$BASE/subscription/entitlements")
[ "$(echo "$ENT" | J "['credits']['balance']")" = "12" ] || { echo "FAIL purchase"; exit 1; }
echo "  paket geldi: bakiye 12 ✓"

echo "→ paket sonrası aynı masal artık üretilebilmeli"
GEN=$(curl -sS -X POST "${AUTH[@]}" -H "Idempotency-Key: smoke2-$SID3" "$BASE/stories/$SID3/generate")
echo "$GEN" | grep -q 'jobId' || { echo "FAIL post-purchase generate: $GEN"; exit 1; }
ENT=$(curl -sS "${AUTH[@]}" "$BASE/subscription/entitlements")
[ "$(echo "$ENT" | J "['credits']['balance']")" = "9" ] || { echo "FAIL post-purchase balance"; exit 1; }
echo "  3 kredi düştü: bakiye 9 ✓"

echo "→ sipariş (kitap baskısı) FEATURE_DISABLED vermeli"
Q=$(curl -sS -X POST "${AUTH[@]}" "$BASE/orders/quote" -H 'content-type: application/json' \
  -d '{"bookId":"cnonexistent12345","bookSize":"SQUARE","coverType":"HARDCOVER","quantity":1}')
echo "$Q" | grep -q 'FEATURE_DISABLED' || { echo "FAIL print gate: $Q"; exit 1; }
echo "  baskı kapısı kapalı ✓"

echo "SMOKE OK ✅"
