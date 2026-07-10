#!/usr/bin/env bash
# Sobe um Postgres de teste via docker, roda a suíte e derruba o banco no fim
# (mesmo se os testes falharem). Uso: npm run test:docker
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"

export DATABASE_URL="postgres://postgres:postgres@localhost:5432/office_timesheet_test"
export JWT_SECRET="${JWT_SECRET:-test-secret}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▶ subindo Postgres de teste..."
docker compose -f "$COMPOSE_FILE" up -d --wait

echo "▶ rodando a suíte..."
cd "$ROOT_DIR/src"
npx vitest run

echo "✔ testes concluídos (banco será derrubado)."
