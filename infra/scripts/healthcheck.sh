#!/usr/bin/env bash
# Staging health probe used by deploy.sh and by the CI post-deploy step.
#
#   infra/scripts/healthcheck.sh
#
# Environment: API_HEALTH_URL, WEB_URL, HEALTH_RETRIES, HEALTH_INTERVAL_SECONDS.

set -euo pipefail

readonly API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/health}"
readonly WEB_URL="${WEB_URL:-http://127.0.0.1:3000/}"
readonly HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
readonly HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"

log() { printf '[health] %s\n' "$1"; }
fail() { printf '[health] ERROR: %s\n' "$1" >&2; exit 1; }

probe() {
  local name="$1"
  local url="$2"
  local attempt=1

  while [[ "${attempt}" -le "${HEALTH_RETRIES}" ]]; do
    if curl --fail --silent --show-error --max-time 10 --output /dev/null "${url}"; then
      log "${name} ok (${url})"
      return 0
    fi
    log "${name} not ready (attempt ${attempt}/${HEALTH_RETRIES})"
    sleep "${HEALTH_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  fail "${name} failed after ${HEALTH_RETRIES} attempts (${url})"
}

probe api "${API_HEALTH_URL}"
probe web "${WEB_URL}"
