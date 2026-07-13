#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose-dev.yml"
BACKEND_URL="${DOCMOST_API_BASE_URL:-http://localhost:3000}"
PUBLIC_URL="${DOCMOST_PUBLIC_BASE_URL:-http://localhost:5173}"
BACKEND_LOG_DIR="${ROOT_DIR}/.local-dev"
BACKEND_LOG_FILE="${BACKEND_LOG_DIR}/server-dev.log"
BACKEND_PID_FILE="${BACKEND_LOG_DIR}/server-dev.pid"
WAIT_SECS="${BOOTSTRAP_TIMEOUT_SECS:-900}"

log() {
  printf '%s\n' "$*"
}

get_listener_pid() {
  lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

is_backend_healthy() {
  curl -fsS "${BACKEND_URL}/api/health" >/dev/null 2>&1
}

is_backend_schema_ready() {
  local status
  status="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -X POST "${BACKEND_URL}/api/workspace/check-hostname" \
      -H 'Content-Type: application/json' \
      -d '{"hostname":"local-bootstrap-probe"}' || true
  )"
  [[ "$status" == "200" || "$status" == "404" ]]
}

wait_for_postgres() {
  local deadline
  deadline=$(( $(date +%s) + WAIT_SECS ))
  while (( $(date +%s) < deadline )); do
    if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres -d docmost >/dev/null 2>&1; then
      log "Postgres is ready."
      return
    fi
    sleep 2
  done

  log "Timed out waiting for Postgres readiness."
  docker compose -f "$COMPOSE_FILE" logs --tail=80 db || true
  exit 1
}

ensure_backend_started() {
  mkdir -p "$BACKEND_LOG_DIR"

  if is_backend_healthy; then
    if is_backend_schema_ready; then
      log "Backend already reachable and schema-ready at ${BACKEND_URL}."
      return
    fi

    listener_pid="$(get_listener_pid)"
    log "Backend on ${BACKEND_URL} is reachable but schema is not ready."
    if [[ -n "${listener_pid}" ]]; then
      log "Stopping stale backend listener on port 3000 (PID ${listener_pid}) so migrations can run."
      kill "${listener_pid}" || true
      sleep 2
    fi
  fi

  if [[ -f "$BACKEND_PID_FILE" ]]; then
    existing_pid="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
      log "Stopping previous managed backend process ${existing_pid} before restart."
      kill "${existing_pid}" || true
      sleep 2
    fi
    rm -f "$BACKEND_PID_FILE"
  fi

  log "Starting backend with 'corepack pnpm run server:dev'..."
  nohup corepack pnpm run server:dev >"$BACKEND_LOG_FILE" 2>&1 &
  backend_pid=$!
  echo "$backend_pid" >"$BACKEND_PID_FILE"
  log "Backend started in background with PID ${backend_pid}. Logs: ${BACKEND_LOG_FILE}"
}

wait_for_backend() {
  deadline=$(( $(date +%s) + WAIT_SECS ))
  local announced_wait=false
  while (( $(date +%s) < deadline )); do
    if is_backend_healthy && is_backend_schema_ready; then
      log "Backend is healthy and schema-ready at ${BACKEND_URL}."
      return
    fi

    if [[ "${announced_wait}" == false ]]; then
      log "Waiting for backend migrations/schema readiness..."
      announced_wait=true
    fi
    sleep 2
  done

  log "Timed out waiting for backend readiness at ${BACKEND_URL}"
  if [[ -f "$BACKEND_LOG_FILE" ]]; then
    log "Recent backend log output:"
    tail -n 50 "$BACKEND_LOG_FILE" || true
  fi
  exit 1
}

log "Bringing up local infra from ${COMPOSE_FILE}..."
docker compose -f "$COMPOSE_FILE" up -d db redis keycloak keycloak-setup

wait_for_postgres
ensure_backend_started
wait_for_backend

log "Running Docmost/Keycloak bootstrap against live backend..."
DOCMOST_API_BASE_URL="$BACKEND_URL" \
DOCMOST_PUBLIC_BASE_URL="$PUBLIC_URL" \
python3 scripts/setup_docmost_local_auth.py

log ""
log "Local dev bootstrap completed."
log "Frontend: cd apps/client && pnpm dev"
log "App: ${PUBLIC_URL}"
log "Keycloak: http://localhost:8081"
