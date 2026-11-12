#!/usr/bin/env bash
# Daily cron (hPanel): dumps the database to backups/ in the tools folder and keeps the last 14.
set -euo pipefail
umask 077
TOOLS="${EB_TOOLS:-__TOOLS__}"
PHP=/opt/alt/php82/usr/bin/php
DIR="$TOOLS/backups"
mkdir -p "$DIR"
CNF=$(mktemp)
trap 'rm -f "$CNF"' EXIT
# The password goes in a private option file so it never shows in the process list.
"$PHP" -r '$d = (require $argv[1])["db"] ?? []; if (empty($d["name"])) exit(1); $q = fn($v) => "\"" . addcslashes((string) $v, "\\\"") . "\""; echo "[client]\nhost=", $q($d["host"]), "\nuser=", $q($d["user"]), "\npassword=", $q($d["pass"]), "\n";' "$TOOLS/config.php" > "$CNF"
NAME=$("$PHP" -r 'echo (require $argv[1])["db"]["name"];' "$TOOLS/config.php")
OUT="$DIR/$NAME-$(date -u +%Y%m%d-%H%M%S).sql.gz"
if ! mysqldump --defaults-extra-file="$CNF" --single-transaction --no-tablespaces "$NAME" | gzip -9 > "$OUT"; then rm -f "$OUT"; echo "mysqldump failed" >&2; exit 1; fi
ls -1 "$DIR"/*.sql.gz | sort | head -n -14 | xargs -r rm -f
echo "Backup $(basename "$OUT") ($(du -k "$OUT" | cut -f1) KB)"
