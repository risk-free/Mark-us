#!/usr/bin/env bash
# Rolls staging back to the previously deployed SHA.
#
#   infra/scripts/rollback.sh
#
# No-op (exit 0) when no previous SHA is recorded, so it is safe to call from
# a CI failure handler.

set -euo pipefail

readonly DEPLOY_PATH="${DEPLOY_PATH:-/opt/markus}"
readonly STATE_DIR="${DEPLOY_PATH}/.deploy"

log() { printf '[rollback] %s\n' "$1"; }
fail() { printf '[rollback] ERROR: %s\n' "$1" >&2; exit 1; }

cd "${DEPLOY_PATH}"
[[ -f "${STATE_DIR}/previous-sha" ]] || {
  log "no previous SHA recorded — nothing to roll back"
  exit 0
}

previous_sha="$(cat "${STATE_DIR}/previous-sha")"
[[ -n "${previous_sha}" ]] || {
  log "previous SHA is empty — nothing to roll back"
  exit 0
}

log "rolling back to ${previous_sha}"
bash infra/scripts/deploy.sh "${previous_sha}"
log "rolled back to ${previous_sha}"
