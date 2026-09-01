#!/usr/bin/env bash
# Posts the sample Trivy and Falco fixtures at the local ingest endpoints.
# Usage: INGEST_TOKEN=<a project's ingest token, from Settings or the
#        onboarding wizard> ./scripts/send-sample-data.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${INGEST_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "Set INGEST_TOKEN to a project's ingest token (Settings, or the onboarding wizard)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../fixtures"

echo "Posting Trivy sample..."
curl -sS -X POST "$BASE_URL/api/ingest/trivy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @"$FIXTURES_DIR/trivy-sample.json" | tee /dev/stderr

echo
echo "Posting Falco sample..."
curl -sS -X POST "$BASE_URL/api/ingest/falco" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @"$FIXTURES_DIR/falco-sample.json" | tee /dev/stderr

echo
echo "Done."
