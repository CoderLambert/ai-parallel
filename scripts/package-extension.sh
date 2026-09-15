#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$REPO_DIR/dist}"

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 1; }

BUILD_DIR="${EXTENSION_BUILD_DIR:-$REPO_DIR/dist/chrome-mv3}"
BUILD_MANIFEST="$BUILD_DIR/manifest.json"

if [[ ! -f "$BUILD_MANIFEST" ]]; then
  echo "Build manifest not found: $BUILD_MANIFEST" >&2
  echo "Run pnpm build:chrome first" >&2
  exit 1
fi

VERSION="$(node -e 'const fs = require("node:fs"); const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(manifest.version);' "$BUILD_MANIFEST")"
ARCHIVE_NAME="ai-parallel-browser-extension-v${VERSION}.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"

mkdir -p "$OUTPUT_DIR"
rm -f "$ARCHIVE_PATH" "$CHECKSUM_PATH"

STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT
mkdir -p "$STAGING_DIR/ai-parallel-browser-extension"
cp -a "$BUILD_DIR/." "$STAGING_DIR/ai-parallel-browser-extension/"

(
  cd "$STAGING_DIR"
  zip -qr "$ARCHIVE_PATH" "ai-parallel-browser-extension"
)

(
  cd "$OUTPUT_DIR"
  sha256sum "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256"
)

printf 'Created %s\n' "$ARCHIVE_PATH"
printf 'Created %s\n' "$CHECKSUM_PATH"
