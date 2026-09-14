#!/usr/bin/env bash
set -euo pipefail

required=(MONGODB_HOST MONGODB_USERNAME MONGODB_PASSWORD)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done

retention_days="${BACKUP_RETENTION_DAYS:-14}"
interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"
databases=(nutrition_catalog nutrition_tracking)

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  failed=0

  for database in "${databases[@]}"; do
    target="/backups/${database}_${timestamp}.archive.gz"
    temporary="${target}.partial"

    if ! mongodump \
      --host "$MONGODB_HOST" \
      --db "$database" \
      --username "$MONGODB_USERNAME" \
      --password "$MONGODB_PASSWORD" \
      --authenticationDatabase admin \
      --archive="$temporary" \
      --gzip; then
      echo "Backup failed for ${database}" >&2
      rm -f "$temporary"
      failed=1
      continue
    fi

    chmod 600 "$temporary"
    mv "$temporary" "$target"
    sha256sum "$target" > "${target}.sha256"
    chmod 600 "${target}.sha256"
  done

  # Only a run where both databases were archived counts as a success.
  if [[ "$failed" -eq 0 ]]; then
    printf '%s\n' "$timestamp" > /backups/.last-success
  fi

  for database in "${databases[@]}"; do
    find /backups -maxdepth 1 -type f -name "${database}_*.archive.gz" -mtime "+$retention_days" -delete
    find /backups -maxdepth 1 -type f -name "${database}_*.archive.gz.sha256" -mtime "+$retention_days" -delete
  done

  sleep "$interval_seconds"
done
