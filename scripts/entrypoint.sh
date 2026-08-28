#!/bin/sh
# Runs on every container start. Ensures the SQLite schema on the mounted
# volume matches prisma/schema.prisma, then starts the Next.js server in
# production mode.
set -e
cd /app

echo "[entrypoint] Generating Prisma Client..."
bunx prisma generate

echo "[entrypoint] Syncing database schema (prisma db push)..."
bunx prisma db push --skip-generate

HOST="${HOSTNAME:-0.0.0.0}"
PORT="${PORT:-3000}"
echo "[entrypoint] Starting Next.js on ${HOST}:${PORT}..."
exec bunx next start -H "$HOST" -p "$PORT"