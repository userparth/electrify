#!/usr/bin/env bash
# Server chores. Usage: ops.sh [profile] errors [n] | backup | pull-backups
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.env.deploy
if [ -f "deploy/.env.deploy.${1:-}" ]; then source "deploy/.env.deploy.$1"; shift; fi
SSH=(ssh -i "$EB_DEPLOY_KEY" -p "$EB_DEPLOY_PORT" -o BatchMode=yes "$EB_DEPLOY_HOST")

case "${1:-}" in
  errors) "${SSH[@]}" "tail -n ${2:-40} '$EB_TOOLS/logs/errors.log' 2>/dev/null || echo 'No errors logged yet.'" ;;
  backup) "${SSH[@]}" "bash '$EB_TOOLS/backup.sh'" ;;
  pull-backups)
    mkdir -p backups
    rsync -az -e "ssh -i $EB_DEPLOY_KEY -p $EB_DEPLOY_PORT -o BatchMode=yes" "$EB_DEPLOY_HOST:$EB_TOOLS/backups/" backups/
    ls -lh backups ;;
  *) echo "Usage: $0 [profile] errors [n] | backup | pull-backups"; exit 1 ;;
esac
