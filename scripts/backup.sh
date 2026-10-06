#!/usr/bin/env bash
# Creates a timestamped backup: a PostgreSQL dump (custom format) and, for the
# local storage driver, an archive of the image directory.
#   BACKUP_DIR=/var/backups/leonails scripts/backup.sh
# Requires pg_dump matching your PostgreSQL major version.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is not set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

pg_dump --format=custom --no-owner --no-privileges --file "$BACKUP_DIR/db-$STAMP.dump" "$DATABASE_URL"
echo "database: $BACKUP_DIR/db-$STAMP.dump"

if [ "${STORAGE_DRIVER:-local}" = "local" ] && [ -d "${STORAGE_DIR:-./storage}" ]; then
  tar -czf "$BACKUP_DIR/storage-$STAMP.tar.gz" -C "$(dirname "${STORAGE_DIR:-./storage}")" "$(basename "${STORAGE_DIR:-./storage}")"
  echo "images:   $BACKUP_DIR/storage-$STAMP.tar.gz"
else
  echo "images:   using S3 storage; enable bucket versioning or replication at your provider"
fi

# Keep the most recent 30 of each.
ls -1t "$BACKUP_DIR"/db-*.dump 2>/dev/null | tail -n +31 | xargs -r rm --
ls -1t "$BACKUP_DIR"/storage-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm --
