#!/usr/bin/env bash
# Installs CUE locally into tools/cue/bin/ if not already present.
# Respects CUE_BIN env var — if set, skips install.
set -euo pipefail

CUE_VERSION="0.10.1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
CUE_BIN_PATH="$BIN_DIR/cue"

if [ -n "${CUE_BIN:-}" ]; then
  echo "CUE_BIN is set ($CUE_BIN), skipping install."
  exit 0
fi

if [ -x "$CUE_BIN_PATH" ]; then
  echo "CUE already installed at $CUE_BIN_PATH"
  exit 0
fi

mkdir -p "$BIN_DIR"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

URL="https://github.com/cue-lang/cue/releases/download/v${CUE_VERSION}/cue_v${CUE_VERSION}_${OS}_${ARCH}.tar.gz"

echo "Downloading CUE v${CUE_VERSION} for ${OS}/${ARCH}..."
curl -fsSL "$URL" | tar xz -C "$BIN_DIR" cue
chmod +x "$CUE_BIN_PATH"
echo "Installed CUE to $CUE_BIN_PATH"
