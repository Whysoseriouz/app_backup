#!/bin/sh
# Runs as root at container start. Ensures the data volume is writable
# by the nextjs user, then drops privileges via gosu before exec'ing the
# Next.js server. Handles bind-mounted host directories that default to
# root:root ownership.
set -e

mkdir -p /app/data

# Without AUTH_SECRET the app refuses to sign sessions. Instead of failing,
# generate a random secret once and keep it in the data volume so sessions
# survive restarts. An explicitly configured AUTH_SECRET always wins.
if [ -z "$AUTH_SECRET" ]; then
  SECRET_FILE=/app/data/.auth_secret
  if [ ! -s "$SECRET_FILE" ]; then
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "[backup-check] AUTH_SECRET not set - generated one in $SECRET_FILE"
  fi
  AUTH_SECRET=$(cat "$SECRET_FILE")
  export AUTH_SECRET
fi

chown -R nextjs:nodejs /app/data

exec gosu nextjs "$@"
