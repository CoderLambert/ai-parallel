#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_DIR/apps/browser-extension/manifest.json"
OUTPUT_DIR="${1:-$REPO_DIR/dist}"

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 1; }

if ! git -C "$REPO_DIR" diff --quiet -- apps/browser-extension ||
   ! git -C "$REPO_DIR" diff --cached --quiet -- apps/browser-extension; then
  echo "Commit browser-extension changes before packaging" >&2
  exit 1
fi

VERSION="$(node -p "require('$MANIFEST').version")"
ARCHIVE_NAME="ai-parallel-browser-extension-v${VERSION}.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"

mkdir -p "$OUTPUT_DIR"
git -C "$REPO_DIR" archive \
  --format=zip \
  --prefix="ai-parallel-browser-extension/" \
  --output="$ARCHIVE_PATH" \
  HEAD:apps/browser-extension

(
  cd "$OUTPUT_DIR"
  sha256sum "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256"
)

printf 'Created %s\n' "$ARCHIVE_PATH"
printf 'Created %s\n' "$CHECKSUM_PATH"
