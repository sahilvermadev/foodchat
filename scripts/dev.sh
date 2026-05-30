#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_BUILD=0
BACKEND_CMD="${BACKEND_CMD:-npm run backend:dev}"
FRONTEND_CMD="${FRONTEND_CMD:-npm run frontend:dev}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/dev.sh [--build]

Starts the local Mise app:
  - backend:  http://localhost:3080
  - frontend: http://localhost:3090

Options:
  --build    Build shared packages before starting dev servers.

Environment overrides:
  BACKEND_CMD="npm run backend" ./scripts/dev.sh
  FRONTEND_CMD="cd client && npm run dev" ./scripts/dev.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      RUN_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -d node_modules ]]; then
  echo "node_modules is missing. Run npm install first." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Warning: .env was not found. Continuing with existing environment variables." >&2
fi

if [[ "$RUN_BUILD" == "1" ]]; then
  npm run build:packages
fi

PIDS=()

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    echo
    echo "Stopping dev servers..."
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
    done
    wait "${PIDS[@]}" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

run_named() {
  local name="$1"
  local command="$2"
  (
    set +e
    eval "$command"
    status=$?
    echo "[$name] exited with status $status"
    exit "$status"
  ) &
  PIDS+=("$!")
}

echo "Starting Mise dev servers..."
echo "Backend:  http://localhost:3080"
echo "Frontend: http://localhost:3090"
echo

run_named "backend" "$BACKEND_CMD"
run_named "frontend" "$FRONTEND_CMD"

wait -n "${PIDS[@]}"
