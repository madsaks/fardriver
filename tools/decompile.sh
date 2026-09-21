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

unpack() {
  mkdir -p "$OUT/_apks"
  log "unpacking XAPKs"
  unzip -oq "$APPS"/Worthless*.xapk worthless.control.apk config.en.apk -d "$OUT/_apks/w"
  mv -f "$OUT/_apks/w/worthless.control.apk" "$OUT/_apks/worthless.apk"
  mv -f "$OUT/_apks/w/config.en.apk" "$OUT/_apks/worthless-en.apk"
  unzip -oq "$APPS"/GDriver*.xapk app.ghdriver.android.apk config.en.apk -d "$OUT/_apks/g"
  mv -f "$OUT/_apks/g/app.ghdriver.android.apk" "$OUT/_apks/gdriver.apk"
  mv -f "$OUT/_apks/g/config.en.apk" "$OUT/_apks/gdriver-en.apk"
  rm -rf "$OUT/_apks/w" "$OUT/_apks/g"
  cp -f "$APPS"/南京远驱288-Signed.Apk "$OUT/_apks/official.apk"
}

decompile_official() {
  local d="$OUT/official"
  [ -d "$d/src/MotorNet6" ] && { log "official already decompiled"; return; }
  mkdir -p "$d/blob" "$d/assemblies" "$d/src"
  unzip -oq "$OUT/_apks/official.apk" 'assemblies/*' -d "$d/blob"
  log "unpacking assemblies.blob"
  (cd "$d/blob/assemblies" && "$PYXAMSTORE" unpack -d .)
  # pyxamstore writes to ./out/ next to the blob
  cp -f "$d/blob/assemblies/out/"*.dll "$d/assemblies/"
  for asm in MotorNet6 MotorNet6.Android Plugin.BLE Plugin.BLE.Abstractions; do
    log "ilspy $asm"
    "$ILSPY" "$d/assemblies/$asm.dll" -p -o "$d/src/$asm" --referencepath "$d/assemblies" || true
  done
}

decompile_worthless() {
  local d="$OUT/worthless"
  [ -d "$d/jadx/sources" ] && { log "worthless already decompiled"; return; }
  mkdir -p "$d/jadx" "$d/strings" "$d/files"
  log "jadx worthless (this takes a few minutes)"
  # jadx exits non-zero (observed: 3) whenever any individual class fails to
  # decompile (227/4304 here, typical for R8-obfuscated bytecode) even though
  # it still writes out everything it could; `|| true` keeps that from
  # aborting the script under `set -e` before the resource/string steps below.
  "$JADX" --deobf --threads-count 8 -d "$d/jadx" "$OUT/_apks/worthless.apk" || true
  "$JADX" -d "$d/jadx-en" "$OUT/_apks/worthless-en.apk" || true
  local res="$d/jadx/resources/assets/composeResources/fd_android.shared.generated.resources"
  cp -f "$res/files/motors.json" "$res/files/sotion_params.json" "$res/files/racedash.html" "$d/files/"
  for cvr in "$res"/values*/strings.commonMain.cvr; do
    loc="$(basename "$(dirname "$cvr")")"
    uv run --no-project "$REPO/tools/cvr2json.py" "$cvr" > "$d/strings/$loc.json"
  done
}

decompile_gdriver() {
  local d="$OUT/gdriver"
  [ -f "$d/decompiled.js" ] && { log "gdriver already decompiled"; return; }
  mkdir -p "$d"
  unzip -p "$OUT/_apks/gdriver.apk" assets/index.android.bundle > "$d/index.android.bundle"
  log "hermes-dec gdriver"
  "$HBC" "$d/index.android.bundle" "$d/decompiled.js" || log "hbc-decompiler failed (unsupported bytecode version?) — falling back to disassembler"
  "$HBC_DISASM" "$d/index.android.bundle" "$d/disasm.txt" || true
  strings -n 6 "$d/index.android.bundle" > "$d/strings.txt"
  "$JADX" -d "$d/jadx-en" "$OUT/_apks/gdriver-en.apk" || true
}

decompile() { decompile_official; decompile_worthless; decompile_gdriver; }

case "${1:-all}" in
  --check) check ;;
  --install) install ;;
  --unpack) unpack ;;
  --decompile) decompile ;;
  all) install && check && unpack && decompile ;;
  *) echo "usage: $0 [--check|--install|--unpack|--decompile]" >&2; exit 2 ;;
esac
