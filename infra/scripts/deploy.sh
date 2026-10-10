#!/usr/bin/env bash
# Deploys a pinned commit SHA to the staging host (run on the host, not in CI).
#
#   infra/scripts/deploy.sh <sha>
#
# Requires on the host: docker + compose plugin, a git clone at DEPLOY_PATH
# (default /opt/markus), and secrets.env at the repository root. Images are
# pulled by SHA tag; the host never builds.

set -euo pipefail

readonly DEPLOY_PATH="${DEPLOY_PATH:-/opt/markus}"
readonly COMPOSE_FILE="infra/compose.staging.yml"
readonly SECRETS_FILE="secrets.env"
readonly STATE_DIR="${DEPLOY_PATH}/.deploy"
readonly SHA_PATTERN='^[0-9a-f]{7,40}$'

log() { printf '[deploy] %s\n' "$1"; }
fail() { printf '[deploy] ERROR: %s\n' "$1" >&2; exit 1; }

compose() {
  docker compose --env-file "${SECRETS_FILE}" -f "${COMPOSE_FILE}" "$@"
}

target_sha="${1:-}"
[[ -n "${target_sha}" ]] || fail "usage: deploy.sh <sha>"
[[ "${target_sha}" =~ ${SHA_PATTERN} ]] || fail "not a commit SHA: ${target_sha}"
[[ -n "${MARKUS_REGISTRY_PATH:-}" ]] || fail "MARKUS_REGISTRY_PATH is not set"
command -v docker >/dev/null 2>&1 || fail "docker is not installed"

cd "${DEPLOY_PATH}"
[[ -f "${COMPOSE_FILE}" ]] || fail "missing ${DEPLOY_PATH}/${COMPOSE_FILE}"
[[ -f "${SECRETS_FILE}" ]] || fail "missing ${DEPLOY_PATH}/${SECRETS_FILE} (see infra/README.md)"

mkdir -p "${STATE_DIR}"
previous_sha="$(cat "${STATE_DIR}/deployed-sha" 2>/dev/null || true)"
export MARKUS_SHA="${target_sha}"

log "pulling images for ${target_sha}"
compose pull || fail "image pull failed for ${target_sha}"

log "applying migrations"
compose run --rm migrate || fail "migrations failed for ${target_sha}; previous release left running"

log "starting services"
compose up -d --remove-orphans

bash infra/scripts/healthcheck.sh || fail "health check failed for ${target_sha}"

if [[ -n "${previous_sha}" && "${previous_sha}" != "${target_sha}" ]]; then
  printf '%s' "${previous_sha}" >"${STATE_DIR}/previous-sha"
fi
printf '%s' "${target_sha}" >"${STATE_DIR}/deployed-sha"

log "staging now running ${target_sha}"
