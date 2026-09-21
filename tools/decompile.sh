#!/usr/bin/env bash
# tools/decompile.sh — install a user-local decompile toolchain and decompile
# the FarDriver reference apps into reference/decompiled/ (gitignored).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="$REPO/reference/apps"
OUT="$REPO/reference/decompiled"

JADX_VERSION=1.5.6
JADX_DIR="$HOME/.local/opt/jadx"
JADX="$JADX_DIR/bin/jadx"
export DOTNET_ROOT="$HOME/.dotnet"
ILSPY="$HOME/.dotnet/tools/ilspycmd"
PYXAMSTORE="$HOME/.local/bin/pyxamstore"
HBC="$HOME/.local/bin/hbc-decompiler"
HBC_DISASM="$HOME/.local/bin/hbc-disassembler"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

check() {
  local ok=0
  printf '%-16s ' java;        java -version 2>&1 | head -1 || ok=1
  printf '%-16s ' jadx;        [ -x "$JADX" ] && "$JADX" --version || { echo MISSING; ok=1; }
  printf '%-16s ' dotnet;      [ -x "$DOTNET_ROOT/dotnet" ] && "$DOTNET_ROOT/dotnet" --version || { echo MISSING; ok=1; }
  printf '%-16s ' ilspycmd;    [ -x "$ILSPY" ] && "$ILSPY" --version | head -1 || { echo MISSING; ok=1; }
  printf '%-16s ' pyxamstore;  [ -x "$PYXAMSTORE" ] && echo ok || { echo MISSING; ok=1; }
  printf '%-16s ' hbc-decompiler; [ -x "$HBC" ] && echo ok || { echo MISSING; ok=1; }
  printf '%-16s ' uv;          uv --version || ok=1
  return $ok
}

install() {
  if [ ! -x "$JADX" ]; then
    log "installing jadx $JADX_VERSION"
    mkdir -p "$JADX_DIR"
    curl -fsSL -o /tmp/jadx.zip "https://github.com/skylot/jadx/releases/download/v${JADX_VERSION}/jadx-${JADX_VERSION}.zip"
    unzip -oq /tmp/jadx.zip -d "$JADX_DIR" && rm /tmp/jadx.zip
    chmod +x "$JADX"
  fi
  if [ ! -x "$DOTNET_ROOT/dotnet" ]; then
    log "installing .NET SDK 10 to $DOTNET_ROOT"
    curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0 --install-dir "$DOTNET_ROOT"
  fi
  if [ ! -x "$ILSPY" ]; then
    log "installing ilspycmd"
    "$DOTNET_ROOT/dotnet" tool install -g ilspycmd
  fi
  if [ ! -x "$PYXAMSTORE" ]; then
    log "installing pyxamstore"
    uv tool install git+https://github.com/jakev/pyxamstore
  fi
  if [ ! -x "$HBC" ]; then
    log "installing hermes-dec"
    uv tool install hermes-dec==0.1.7
  fi
}

case "${1:-all}" in
  --check) check ;;
  --install) install ;;
  all) install && check ;;
  *) echo "usage: $0 [--check|--install]" >&2; exit 2 ;;
esac
