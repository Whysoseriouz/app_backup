#!/bin/sh
# Runs as root at container start. Ensures the data volume is writable
# by the nextjs user, then drops privileges via gosu before exec'ing the
# Next.js server. Handles bind-mounted host directories that default to
# root:root ownership.
set -e

mkdir -p /app/data
chown -R nextjs:nodejs /app/data

exec gosu nextjs "$@"
