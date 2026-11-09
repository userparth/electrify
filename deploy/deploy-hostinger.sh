#!/usr/bin/env bash
# Static build of apps/web + PHP compile endpoint, uploaded over SSH to shared hosting.
# Settings come from deploy/.env.deploy (not committed): EB_DEPLOY_HOST, EB_DEPLOY_PORT, EB_DEPLOY_KEY,
# EB_DEPLOY_DIR (web folder), EB_TOOLS (folder with bin/arduino-cli), EB_BASE_PATH (e.g. /electrify).
# Usage: deploy-hostinger.sh [profile]  — a profile file deploy/.env.deploy.<profile> overrides those values.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.env.deploy
if [ -n "${1:-}" ]; then source "deploy/.env.deploy.$1"; fi

SSH=(ssh -i "$EB_DEPLOY_KEY" -p "$EB_DEPLOY_PORT" -o BatchMode=yes)
API=apps/web/src/app/api
STASH=$(mktemp -d)
restore() { [ -d "$STASH/api" ] && mv "$STASH/api" "$API"; rm -rf "$STASH"; }
trap restore EXIT

node scripts/fetch-assets.mjs
# Route handlers can't be exported; the PHP endpoint replaces /api/compile on the server.
mv "$API" "$STASH/api"
(cd apps/web && rm -rf out && EB_STATIC=1 EB_BASE_PATH="$EB_BASE_PATH" pnpm exec next build)
restore; trap - EXIT

mkdir -p apps/web/out/api
sed "s|__TOOLS__|$EB_TOOLS|" deploy/php/compile.php > apps/web/out/api/compile.php
for f in deploy/php/api/*; do sed "s|__TOOLS__|$EB_TOOLS|" "$f" > "apps/web/out/api/$(basename "$f")"; done
sed "s|__BASE__|$EB_BASE_PATH|" deploy/htaccess > apps/web/out/.htaccess

"${SSH[@]}" "$EB_DEPLOY_HOST" "mkdir -p '$EB_DEPLOY_DIR'"
rsync -az --delete -e "ssh -i $EB_DEPLOY_KEY -p $EB_DEPLOY_PORT -o BatchMode=yes" apps/web/out/ "$EB_DEPLOY_HOST:$EB_DEPLOY_DIR/"
echo "Deployed to $EB_DEPLOY_HOST:$EB_DEPLOY_DIR"
