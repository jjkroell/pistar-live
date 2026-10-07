#!/bin/sh
# Build dist/pistar-live-install.sh: installer.sh.in + a base64 tar.gz payload.
set -e
cd "$(dirname "$0")"
VERSION="$(cat VERSION)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/live" "$stage/skin" "$stage/nginx" dist

cp index.php data.php sys.php cfg.php cfg.inc.php compat.inc.php app.css app.js "$stage/live/"
cp skin/skin.css skin/skin.js "$stage/skin/"
cp live-landing.conf "$stage/nginx/"
# Cache-bust the injected skin and the admin-embedded app with the release version.
sed -E "s/\?v=[0-9A-Za-z.]+/?v=$VERSION/g" skin/skin-inject.conf > "$stage/nginx/skin-inject.conf"
sed -i -E "s/var LIVE_V = '[^']*'/var LIVE_V = '$VERSION'/" "$stage/skin/skin.js"

out="dist/pistar-live-install.sh"
sed "s/__VERSION__/$VERSION/g" installer.sh.in > "$out"
tar -C "$stage" -czf - live skin nginx | base64 >> "$out"
chmod +x "$out"
echo "built $out ($(wc -c < "$out") bytes, version $VERSION)"
