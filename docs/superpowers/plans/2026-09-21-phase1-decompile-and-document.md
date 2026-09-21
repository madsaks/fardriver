# Phase 1: Decompile & Document — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the three FarDriver Android apps into a written BLE protocol spec (`docs/protocol.md`) and a validated, explained register table (`protocol/registers.json`, `protocol/telemetry.json`), plus a one-command decompile script.

**Architecture:** A shell script installs a user-local toolchain and decompiles all three apps into `reference/decompiled/` (gitignored). The analysis tasks read those trees and write findings into two committed artifacts: a prose spec and JSON tables. A JSON-schema validator and a Python re-implementation of the frame checksum turn the spec's claims into runnable tests, so later phases inherit fixtures rather than prose.

**Tech Stack:** bash, Java 21 (already present) + jadx 1.5.6, .NET SDK 8 + ilspycmd, `uv` (pyxamstore from git, hermes-dec 0.1.7, jsonschema, pytest), Python 3.11.

**Spec:** `docs/superpowers/specs/2026-09-21-fardriver-protocol-and-web-app-design.md` (sections 4 and 3).

## Global Constraints

- Nothing installed system-wide; all tools go under `~/.local/opt`, `~/.dotnet`, or `uv tool`. No `sudo`.
- `reference/apps/`, `reference/decompiled/`, `reference/firmware/` are gitignored and never committed. Only `tools/`, `docs/`, `protocol/` are committed.
- No decompiled code is copied into any committed file. Findings are documented; code is written fresh.
- `registers.json` entries must carry `source` (file#line in `reference/decompiled/`) and `confidence` ∈ `high|medium|low`. Nothing gets `high` in this phase (that needs on-bike validation in phase 2); use `medium` when official and Worthless agree, `low` otherwise.
- Consultation order (corrected from spec §4.2 after recon): **official 288 app first** (Xamarin C#, full symbol names in `MotorNet6.dll`), **Worthless second** (R8-obfuscated, but string constants and Kotlin data-class `toString()` field names are intact, and it ships `motors.json`/`sotion_params.json`), **GDriver last** (Hermes bytecode; only for parameters the other two leave unexplained).
- Python in `tools/` runs via `uv run --with <deps>` or a `pyproject.toml` in the tool's directory; no global pip.

## Recon facts (already verified — do not re-derive)

| App | File inside XAPK/APK | Format | Notes |
|---|---|---|---|
| Official 288 | `南京远驱288-Signed.Apk` → `assemblies/assemblies.blob` + `assemblies.manifest` | XABA v1 blob | Assemblies of interest: `MotorNet6`, `MotorNet6.Android`, `Plugin.BLE`, `MQTTnet`, `Jurassic`, `Newtonsoft.Json` |
| Worthless 5.1.16 | `Worthless+Controls+-+Fardriver_5.1.16_APKPure.xapk` → `worthless.control.apk` → `classes.dex` | Kotlin Multiplatform + Compose, R8-obfuscated (`a/zz4`) | Assets: `assets/composeResources/fd_android.shared.generated.resources/files/{motors.json,sotion_params.json,racedash.html}` and `values*/strings.commonMain.cvr`. No UUID strings in dex (UUIDs are probably built from longs). |
| GDriver 3.4.0 | `GDriver_+FarDriver+Tuning_3.4.0_APKPure.xapk` → `app.ghdriver.android.apk` → `assets/index.android.bundle` | Hermes bytecode (magic `c6 1f bc 03 c1 03 19 1f`) | React Native/Expo |

## File map

| Path | Responsibility |
|---|---|
| `tools/decompile.sh` | Install toolchain (idempotent), unpack packages, run all decompilers, decode resource tables. `--check` prints tool versions and exits. |
| `tools/cvr2json.py` | Decode Compose Multiplatform `.cvr` string tables to JSON. |
| `tools/registers/pyproject.toml` | uv project: `jsonschema`, `pytest`. |
| `tools/registers/validate.py` | Validate `protocol/*.json` against `protocol/schema/*.json`; CLI exit code. |
| `tools/registers/gen_validation_md.py` | Generate `docs/validation.md` checklist from `registers.json`. |
| `tools/registers/tests/test_validate.py` | Tests for the validator. |
| `tools/protocol/fardriver_frame.py` | Python reference implementation of the frame checksum + encode/decode, written from the decompiled algorithm. |
| `tools/protocol/tests/test_frame.py` | Asserts every worked example in `docs/protocol.md`. |
| `protocol/schema/register.schema.json` | JSON Schema for one register entry. |
| `protocol/schema/telemetry.schema.json` | JSON Schema for one telemetry field entry. |
| `protocol/registers.json` | The parameter table (spec §4.3). |
| `protocol/telemetry.json` | Live-data frame field layout (same shape as registers, plus `frame` and `offset`). Added to spec scope so phase 2 can decode telemetry from data, not code. |
| `docs/protocol.md` | Prose spec: UUIDs, framing, checksum, read/write, unlock, telemetry, firmware flow, read-flash answer. |
| `docs/validation.md` | Generated checklist for phase 2. |
| `docs/decompile-notes.md` | Where things live in each decompiled tree; gotchas. Written as you go. |

---

### Task 1: Toolchain installer (`tools/decompile.sh --check`)

**Files:**
- Create: `tools/decompile.sh`

**Interfaces:**
- Produces: executable `tools/decompile.sh` with subcommands `--check`, `--install`, `--unpack`, `--decompile`, and no-arg = all. Tool locations exported as shell vars inside the script: `JADX=~/.local/opt/jadx/bin/jadx`, `DOTNET_ROOT=~/.dotnet`, `ILSPY=~/.dotnet/tools/ilspycmd`, `PYXAMSTORE=$(uv tool dir)/pyxamstore/bin/pyxamstore` (or `~/.local/bin/pyxamstore`), `HBC=~/.local/bin/hbc-decompiler`.

- [ ] **Step 1: Write the script skeleton with `--check` and `--install`**

```bash
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
    log "installing .NET SDK 8 to $DOTNET_ROOT"
    curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 --install-dir "$DOTNET_ROOT"
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
```

- [ ] **Step 2: Run `--check` to verify it reports missing tools**

Run: `chmod +x tools/decompile.sh && tools/decompile.sh --check; echo "exit=$?"`
Expected: `jadx MISSING`, `dotnet MISSING`, `ilspycmd MISSING`, `pyxamstore MISSING`, `hbc-decompiler MISSING`, `exit=1`.

- [ ] **Step 3: Run `--install`**

Run: `tools/decompile.sh --install`
Expected: five `==> installing ...` lines, no errors. If `uv tool install` puts binaries somewhere other than `~/.local/bin`, run `uv tool dir --bin` and update `PYXAMSTORE`/`HBC` in the script to that path.

- [ ] **Step 4: Run `--check` again**

Run: `tools/decompile.sh --check; echo "exit=$?"`
Expected: every row prints a version or `ok`; `exit=0`. Run `--install` a second time and confirm it prints nothing (idempotent).

- [ ] **Step 5: Commit**

```bash
git add tools/decompile.sh
git commit -m "tools: add decompile toolchain installer"
```

---

### Task 2: Unpack and decompile all three apps

**Files:**
- Modify: `tools/decompile.sh` (add `unpack` and `decompile` functions, wire into `case`)
- Create: `tools/cvr2json.py`
- Create: `docs/decompile-notes.md`

**Interfaces:**
- Produces the following tree (all under `reference/decompiled/`), which every later task reads:
  - `_apks/official.apk`, `_apks/worthless.apk`, `_apks/gdriver.apk`, `_apks/gdriver-en.apk`, `_apks/worthless-en.apk`
  - `official/assemblies/*.dll` (unpacked from blob), `official/src/MotorNet6/**/*.cs`, `official/src/MotorNet6.Android/**/*.cs`
  - `worthless/jadx/sources/**/*.java`, `worthless/jadx/resources/**`, `worthless/strings/<locale>.json`, `worthless/files/motors.json`, `worthless/files/sotion_params.json`
  - `gdriver/index.android.bundle`, `gdriver/decompiled.js`, `gdriver/disasm.txt`

- [ ] **Step 1: Add `unpack()` to the script**

Insert after `install()`:

```bash
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
```

- [ ] **Step 2: Add `decompile()` — official (Xamarin)**

```bash
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
```

- [ ] **Step 3: Add `decompile()` — Worthless (jadx + resources)**

```bash
decompile_worthless() {
  local d="$OUT/worthless"
  [ -d "$d/jadx/sources" ] && { log "worthless already decompiled"; return; }
  mkdir -p "$d/jadx" "$d/strings" "$d/files"
  log "jadx worthless (this takes a few minutes)"
  "$JADX" --deobf --threads-count 8 -d "$d/jadx" "$OUT/_apks/worthless.apk"
  "$JADX" -d "$d/jadx-en" "$OUT/_apks/worthless-en.apk" || true
  local res="$d/jadx/resources/assets/composeResources/fd_android.shared.generated.resources"
  cp -f "$res/files/motors.json" "$res/files/sotion_params.json" "$res/files/racedash.html" "$d/files/"
  for cvr in "$res"/values*/strings.commonMain.cvr; do
    loc="$(basename "$(dirname "$cvr")")"
    uv run --no-project "$REPO/tools/cvr2json.py" "$cvr" > "$d/strings/$loc.json"
  done
}
```

- [ ] **Step 4: Add `decompile()` — GDriver (Hermes)**

```bash
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
```

Update the `case`:

```bash
case "${1:-all}" in
  --check) check ;;
  --install) install ;;
  --unpack) unpack ;;
  --decompile) decompile ;;
  all) install && check && unpack && decompile ;;
  *) echo "usage: $0 [--check|--install|--unpack|--decompile]" >&2; exit 2 ;;
esac
```

- [ ] **Step 5: Write `tools/cvr2json.py`**

Compose Multiplatform `.cvr` files are line-based: `<type>|<key>|<base64 value>`.

```python
#!/usr/bin/env python3
"""Decode a Compose Multiplatform .cvr string table to JSON {key: value}."""
import base64, json, sys

def decode(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("|", 2)
            if len(parts) != 3:
                raise SystemExit(f"{path}:{lineno}: unexpected line format: {line[:60]!r}")
            typ, key, b64 = parts
            if typ != "string":
                continue
            out[key] = base64.b64decode(b64).decode("utf-8")
    return out

if __name__ == "__main__":
    json.dump(decode(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
```

If the script exits with "unexpected line format", open the `.cvr` with `head -5` and adjust the split; the format is documented in the `org.jetbrains.compose.resources` source as `type|key|base64`.

- [ ] **Step 6: Run the full pipeline**

Run: `tools/decompile.sh --unpack && tools/decompile.sh --decompile`
Expected: completes without `error` lines from jadx/ilspy (warnings are fine). Then verify:

```bash
ls reference/decompiled/official/src/MotorNet6 | head
ls reference/decompiled/worthless/jadx/sources | head
ls reference/decompiled/worthless/strings/ reference/decompiled/worthless/files/
python3 -c "import json;d=json.load(open('reference/decompiled/worthless/strings/values.json'));print(len(d),'strings')"
ls -la reference/decompiled/gdriver/
```
Expected: `.cs` files under MotorNet6; Java packages under worthless (obfuscated names like `a/`); `values.json` with hundreds of strings; `gdriver/decompiled.js` or at least `disasm.txt` + `strings.txt`.

- [ ] **Step 7: Start `docs/decompile-notes.md`**

Record, for each app: what the script produced, where the app's own (non-library) code lives, and anything that failed. Minimum content:

```markdown
# Decompile notes

Regenerate everything with `tools/decompile.sh`. Output is in `reference/decompiled/` (gitignored).

## Official 288 (Xamarin)
- Logic: `reference/decompiled/official/src/MotorNet6/` — <fill in the namespaces you see, e.g. MotorNet6.Services, MotorNet6.Models>
- BLE plumbing: `Plugin.BLE` (third-party, not FarDriver-specific)
- Gotchas: <e.g. ilspy failures, missing references>

## Worthless Controls (KMP, R8-obfuscated)
- App code: `reference/decompiled/worthless/jadx/sources/a/` (obfuscated). Navigate by string constants.
- Strings: `reference/decompiled/worthless/strings/values.json` (English)
- Data files: `reference/decompiled/worthless/files/{motors.json,sotion_params.json}`

## GDriver (Hermes)
- `reference/decompiled/gdriver/decompiled.js` — <did hermes-dec succeed? bytecode version?>
```

- [ ] **Step 8: Commit**

```bash
git add tools/decompile.sh tools/cvr2json.py docs/decompile-notes.md
git commit -m "tools: decompile all three FarDriver apps into reference/decompiled"
```

---

### Task 3: Register/telemetry JSON schema and validator

**Files:**
- Create: `protocol/schema/register.schema.json`
- Create: `protocol/schema/telemetry.schema.json`
- Create: `protocol/registers.json` (empty array)
- Create: `protocol/telemetry.json` (empty array)
- Create: `tools/registers/pyproject.toml`
- Create: `tools/registers/validate.py`
- Create: `tools/registers/tests/test_validate.py`

**Interfaces:**
- Produces: `validate.py` CLI: `uv run --project tools/registers tools/registers/validate.py` → exit 0 if both JSON files validate and have no duplicate `addr`/`key`, else prints errors and exit 1. Python API: `validate_file(path: Path, schema_path: Path) -> list[str]` returning error strings (empty = valid).

- [ ] **Step 1: Write the schemas**

`protocol/schema/register.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FarDriver register",
  "type": "object",
  "required": ["addr", "key", "name", "type", "scale", "unit", "min", "max", "access", "group", "enum", "explain", "confidence", "source"],
  "additionalProperties": false,
  "properties": {
    "addr": { "type": "integer", "minimum": 0, "maximum": 65535 },
    "key": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "name": { "type": "string", "minLength": 1 },
    "type": { "enum": ["u8", "i8", "u16", "i16", "u32", "i32", "bitfield", "enum"] },
    "scale": { "type": "number", "exclusiveMinimum": 0 },
    "unit": { "type": "string" },
    "min": { "type": "number" },
    "max": { "type": "number" },
    "access": { "enum": ["r", "rw"] },
    "group": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "enum": {
      "oneOf": [
        { "type": "null" },
        { "type": "object", "patternProperties": { "^[0-9]+$": { "type": "string" } }, "additionalProperties": false }
      ]
    },
    "explain": { "type": "string", "minLength": 20 },
    "confidence": { "enum": ["high", "medium", "low"] },
    "source": { "type": "array", "minItems": 1, "items": { "type": "string", "pattern": "^(official|worthless|gdriver):" } },
    "notes": { "type": "string" }
  }
}
```

`protocol/schema/telemetry.schema.json` — same as above but: no `access`, no `min`/`max` required, and two extra required fields `frame` (string, the frame/command id this field arrives in, e.g. `"0xE2"`) and `offset` (integer byte offset in the payload):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FarDriver telemetry field",
  "type": "object",
  "required": ["frame", "offset", "key", "name", "type", "scale", "unit", "group", "enum", "explain", "confidence", "source"],
  "additionalProperties": false,
  "properties": {
    "frame": { "type": "string", "pattern": "^0x[0-9A-F]{2}$" },
    "offset": { "type": "integer", "minimum": 0 },
    "key": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "name": { "type": "string", "minLength": 1 },
    "type": { "enum": ["u8", "i8", "u16", "i16", "u32", "i32", "bitfield", "enum"] },
    "scale": { "type": "number", "exclusiveMinimum": 0 },
    "unit": { "type": "string" },
    "group": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
    "enum": {
      "oneOf": [
        { "type": "null" },
        { "type": "object", "patternProperties": { "^[0-9]+$": { "type": "string" } }, "additionalProperties": false }
      ]
    },
    "explain": { "type": "string", "minLength": 20 },
    "confidence": { "enum": ["high", "medium", "low"] },
    "source": { "type": "array", "minItems": 1, "items": { "type": "string", "pattern": "^(official|worthless|gdriver):" } },
    "notes": { "type": "string" }
  }
}
```

`protocol/registers.json` and `protocol/telemetry.json`: each just `[]`.

- [ ] **Step 2: Write the pyproject**

`tools/registers/pyproject.toml`:

```toml
[project]
name = "fardriver-registers"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["jsonschema>=4.23"]

[dependency-groups]
dev = ["pytest>=8"]
```

- [ ] **Step 3: Write the failing tests**

`tools/registers/tests/test_validate.py`:

```python
import json
from pathlib import Path

import pytest

from validate import validate_file

ROOT = Path(__file__).resolve().parents[3]
REG_SCHEMA = ROOT / "protocol/schema/register.schema.json"
TEL_SCHEMA = ROOT / "protocol/schema/telemetry.schema.json"

GOOD_REG = {
    "addr": 43, "key": "phase_current_limit", "name": "Phase current limit",
    "type": "u16", "scale": 1, "unit": "A", "min": 0, "max": 600, "access": "rw",
    "group": "motor", "enum": None,
    "explain": "Peak current the controller will push through the motor windings.",
    "confidence": "medium", "source": ["official:MotorNet6/Models/Params.cs#L12"],
}

def write(tmp_path: Path, entries) -> Path:
    p = tmp_path / "x.json"
    p.write_text(json.dumps(entries))
    return p

def test_valid_register_passes(tmp_path):
    assert validate_file(write(tmp_path, [GOOD_REG]), REG_SCHEMA) == []

def test_missing_field_fails(tmp_path):
    bad = {k: v for k, v in GOOD_REG.items() if k != "explain"}
    errs = validate_file(write(tmp_path, [bad]), REG_SCHEMA)
    assert errs and "explain" in errs[0]

def test_duplicate_addr_fails(tmp_path):
    other = dict(GOOD_REG, key="other_key")
    errs = validate_file(write(tmp_path, [GOOD_REG, other]), REG_SCHEMA)
    assert any("duplicate addr 43" in e for e in errs)

def test_duplicate_key_fails(tmp_path):
    other = dict(GOOD_REG, addr=44)
    errs = validate_file(write(tmp_path, [GOOD_REG, other]), REG_SCHEMA)
    assert any("duplicate key phase_current_limit" in e for e in errs)

def test_bad_source_prefix_fails(tmp_path):
    bad = dict(GOOD_REG, source=["somewhere.cs"])
    errs = validate_file(write(tmp_path, [bad]), REG_SCHEMA)
    assert errs

def test_telemetry_entry(tmp_path):
    tel = {
        "frame": "0xE2", "offset": 4, "key": "bus_voltage", "name": "Bus voltage",
        "type": "u16", "scale": 0.1, "unit": "V", "group": "power", "enum": None,
        "explain": "Battery pack voltage as measured at the controller's DC input.",
        "confidence": "low", "source": ["worthless:jadx/sources/a/b.java#L1"],
    }
    assert validate_file(write(tmp_path, [tel]), TEL_SCHEMA) == []

def test_repo_files_validate():
    assert validate_file(ROOT / "protocol/registers.json", REG_SCHEMA) == []
    assert validate_file(ROOT / "protocol/telemetry.json", TEL_SCHEMA) == []
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd tools/registers && uv run --group dev pytest -q`
Expected: `ImportError: cannot import name 'validate_file'` / module not found.

- [ ] **Step 5: Write `tools/registers/validate.py`**

```python
#!/usr/bin/env python3
"""Validate protocol/registers.json and protocol/telemetry.json.

Usage: uv run --project tools/registers tools/registers/validate.py
Exit 0 when valid; prints one error per line and exits 1 otherwise.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]


def validate_file(path: Path, schema_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text())
    entries = json.loads(path.read_text())
    errors: list[str] = []
    if not isinstance(entries, list):
        return [f"{path}: top level must be a list"]
    v = Draft202012Validator(schema)
    for i, entry in enumerate(entries):
        for err in sorted(v.iter_errors(entry), key=lambda e: list(e.path)):
            where = "/".join(str(p) for p in err.path) or "(entry)"
            errors.append(f"{path}[{i}] {where}: {err.message}")
    unique_field = "addr" if "addr" in schema["properties"] else None
    if unique_field:
        for val, n in Counter(e.get(unique_field) for e in entries if isinstance(e, dict)).items():
            if n > 1:
                errors.append(f"{path}: duplicate {unique_field} {val} ({n} entries)")
    for val, n in Counter(e.get("key") for e in entries if isinstance(e, dict)).items():
        if n > 1:
            errors.append(f"{path}: duplicate key {val} ({n} entries)")
    return errors


def main() -> int:
    errs = validate_file(ROOT / "protocol/registers.json", ROOT / "protocol/schema/register.schema.json")
    errs += validate_file(ROOT / "protocol/telemetry.json", ROOT / "protocol/schema/telemetry.schema.json")
    for e in errs:
        print(e)
    print("OK" if not errs else f"{len(errs)} error(s)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
```

Add to `pyproject.toml` so tests can import it:

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd tools/registers && uv run --group dev pytest -q`
Expected: `7 passed`.

- [ ] **Step 7: Commit**

```bash
git add protocol/ tools/registers/
git commit -m "protocol: add register/telemetry schemas and validator"
```

---

### Task 4: BLE transport, framing, checksum, read/write, unlock (official app)

**Files:**
- Create: `docs/protocol.md` (sections 1–4)
- Create: `tools/protocol/pyproject.toml`
- Create: `tools/protocol/fardriver_frame.py`
- Create: `tools/protocol/tests/test_frame.py`
- Modify: `docs/decompile-notes.md`

**Interfaces:**
- Produces: `fardriver_frame.py` with `checksum(payload: bytes) -> int` (or `-> bytes` if the algorithm yields more than one byte — pick whichever matches the decompiled code and document it), `encode_read(addr: int) -> bytes`, `encode_write(addr: int, value: int) -> bytes`, `decode(frame: bytes) -> Frame` where `Frame` is a dataclass with `cmd: int`, `addr: int | None`, `payload: bytes`, `checksum_ok: bool`. Later tasks and phase 2 fixtures rely on these names.

- [ ] **Step 1: Locate the BLE layer in the official app**

```bash
cd reference/decompiled/official/src
grep -rniE 'Guid\(|Guid\.Parse|"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}' MotorNet6 MotorNet6.Android | head -30
grep -rniE 'GetServiceAsync|GetCharacteristicAsync|StartUpdatesAsync|WriteAsync|ValueUpdated' MotorNet6 MotorNet6.Android | head -30
```

Record the service UUID, write characteristic UUID, notify characteristic UUID, and the file:line of each in `docs/decompile-notes.md` under "Official → BLE".

- [ ] **Step 2: Locate the frame builder and checksum**

```bash
grep -rniE 'crc|checksum|\^=|0xAA|0xEE|byte\[\] *\w+ *= *new byte\[' MotorNet6 | head -40
grep -rniE 'ValueUpdated|OnDataReceived|Parse(Frame|Packet|Data)' MotorNet6 | head
```

Open the hits. Read the complete send path (the function that turns a register address + value into bytes) and the complete receive path (the function that takes notify bytes and dispatches on a command/address). Note: FarDriver frames are commonly 16 bytes, header `0xAA`, and use a CRC-16 or an XOR/sum checksum — but **write down what the code does, not what you expect**.

- [ ] **Step 3: Write `docs/protocol.md` sections 1–4**

Structure (fill every `<…>` with what you found; cite `official:<file>#L<n>` next to each claim):

```markdown
# FarDriver BLE protocol

Derived from decompiling the official 南京远驱 288 app (primary) and Worthless
Controls 5.1.16 (secondary). Every claim cites its source as
`<app>:<path under reference/decompiled/><#Lline>`. Byte examples in this
file are executed as tests by `tools/protocol/tests/test_frame.py`.

## 1. BLE transport
- Advertised name pattern: <…>
- Service UUID: <…>  (official:…)
- Write characteristic: <…>, write type: <with/without response>  (official:…)
- Notify characteristic: <…>  (official:…)
- MTU / max write size: <…>
- Connect sequence: <step list — e.g. subscribe notify, send handshake X, wait for Y>

## 2. Frame format
<byte-by-byte table: offset, size, meaning, for TX and RX frames>
Header: <…>. Length: <fixed N / variable>. Endianness of multi-byte values: <…>.

## 3. Checksum
<algorithm in prose + the exact code translated to Python — this is what fardriver_frame.py implements>
Which bytes are covered: <…>. Where the result is placed: <…>.

## 4. Commands
### 4.1 Read register
TX: <hex example, e.g. `AA 13 EC 07 01 F1 A2 5D 00 00 00 00 00 00 00 00`>  (official:…)
RX: <hex example>
### 4.2 Write register
TX: <hex example>  RX/ack: <hex example or "none">
### 4.3 Unlock / password
<Is there one? What is sent, when, and what the response looks like. If none, say so and cite the write path that shows no gate.>
### 4.4 Other commands seen
<table: cmd byte → purpose → source>
```

The hex examples must be **real**: either literal byte arrays found in the code, or produced by hand-executing the decompiled builder for a specific address/value and showing the arithmetic.

- [ ] **Step 4: Write the failing frame tests from the doc's examples**

`tools/protocol/pyproject.toml`:

```toml
[project]
name = "fardriver-protocol"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

`tools/protocol/tests/test_frame.py` — replace the hex strings with the exact examples from `docs/protocol.md` §4:

```python
from fardriver_frame import checksum, encode_read, encode_write, decode

READ_TX = bytes.fromhex("<hex from protocol.md §4.1 TX>")
READ_ADDR = 0x00  # the addr that example reads
WRITE_TX = bytes.fromhex("<hex from protocol.md §4.2 TX>")
WRITE_ADDR, WRITE_VALUE = 0x00, 0  # from the same example
RX_FRAME = bytes.fromhex("<hex from protocol.md §4.1 RX>")

def test_checksum_matches_doc_example():
    body, expected = READ_TX[:-<checksum size>], READ_TX[-<checksum size>:]
    assert checksum(body) == int.from_bytes(expected, "<endianness from §3>")

def test_encode_read_matches_doc():
    assert encode_read(READ_ADDR) == READ_TX

def test_encode_write_matches_doc():
    assert encode_write(WRITE_ADDR, WRITE_VALUE) == WRITE_TX

def test_decode_rx_frame():
    f = decode(RX_FRAME)
    assert f.checksum_ok
    assert f.cmd == RX_FRAME[<cmd offset>]

def test_decode_rejects_bad_checksum():
    bad = bytearray(RX_FRAME); bad[-1] ^= 0xFF
    assert not decode(bytes(bad)).checksum_ok
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd tools/protocol && uv run --group dev pytest -q`
Expected: `ModuleNotFoundError: fardriver_frame`.

- [ ] **Step 6: Implement `tools/protocol/fardriver_frame.py`**

Write it from the decompiled algorithm, not from memory. Skeleton:

```python
"""Reference implementation of FarDriver BLE framing.

Written from docs/protocol.md; that document cites the decompiled source for
every constant here. Pure Python, no deps — phase 2 ports this to TypeScript.
"""
from dataclasses import dataclass

HEADER = 0xAA          # <replace with §2 value>
FRAME_LEN = 16         # <replace with §2 value, or remove if variable-length>
CMD_READ = 0x00        # <§4.1>
CMD_WRITE = 0x00       # <§4.2>


def checksum(body: bytes) -> int:
    """<algorithm name from §3>. Covers <which bytes>."""
    raise NotImplementedError  # translate the decompiled loop here


def encode_read(addr: int) -> bytes:
    ...


def encode_write(addr: int, value: int) -> bytes:
    ...


@dataclass(frozen=True)
class Frame:
    cmd: int
    addr: int | None
    payload: bytes
    checksum_ok: bool


def decode(frame: bytes) -> Frame:
    ...
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd tools/protocol && uv run --group dev pytest -q`
Expected: `5 passed`. If a test fails, the doc example and the code disagree — go back to the decompiled source and fix whichever is wrong; do not "fix" the test to match the code.

- [ ] **Step 8: Commit**

```bash
git add docs/protocol.md docs/decompile-notes.md tools/protocol/
git commit -m "protocol: document BLE transport, framing, checksum, read/write from official app"
```

---

### Task 5: Register table from the official app

**Files:**
- Modify: `protocol/registers.json`
- Modify: `docs/decompile-notes.md`

**Interfaces:**
- Produces: `registers.json` populated with every parameter the official app can read or write, `confidence: "low"`, `source: ["official:…"]`. Keys are stable from here on — later tasks add sources and raise confidence but do not rename keys.

- [ ] **Step 1: Find the parameter definitions**

```bash
cd reference/decompiled/official/src/MotorNet6
grep -rlE 'class .*(Param|Setting|Register|Config)' . | head
grep -rnE '(Address|Addr|Index|Reg)\s*=\s*(0x[0-9A-Fa-f]+|[0-9]+)' . | head -40
grep -rnE '(Min|Max|Scale|Unit|Step)\s*=' . | head -40
```

Also check the `Jurassic` usage — if the app evaluates JS for parameter definitions, the table may be in a `.js` string or asset:

```bash
grep -rn 'Jurassic\|ScriptEngine\|Evaluate(' . | head
unzip -l ../../../_apks/official.apk | grep -iE '\.js|\.json|\.xml' | grep -v res/ | head
```

Record where the table lives in `docs/decompile-notes.md`.

- [ ] **Step 2: Extract the table mechanically where possible**

If definitions are a list of object initialisers or a switch, write a throwaway script in the scratchpad (not committed) that regexes them into JSON. Otherwise transcribe by hand. For each parameter produce an entry with:
- `addr`, `type` (from how the value is packed — 1 or 2 bytes, signed?), `scale`, `unit`, `min`, `max`, `access`, `enum`.
- `name`: English. The official app's labels are Chinese; translate them, and put the original Chinese in `notes` so it can be checked.
- `explain`: your best plain-English explanation of what the parameter does, at least 20 characters. Where you don't know, write what the app's UI shows and end with "(effect unverified)".
- `group`: one of `motor`, `battery`, `throttle`, `brake`, `regen`, `display`, `protection`, `limits`, `misc` — add groups only if none fit.
- `confidence: "low"`, `source: ["official:<file>#L<n>"]`.

- [ ] **Step 3: Validate**

Run: `uv run --project tools/registers tools/registers/validate.py`
Expected: `OK`. Fix every reported error.

- [ ] **Step 4: Sanity count**

Run: `python3 -c "import json;d=json.load(open('protocol/registers.json'));print(len(d));print(sorted({e['group'] for e in d}))"`
Expected: dozens of entries (the official app exposes on the order of 50–150 parameters). If you got fewer than 30, you found a partial table — search again (step 1) for a second table, e.g. an "advanced"/"factory" page.

- [ ] **Step 5: Commit**

```bash
git add protocol/registers.json docs/decompile-notes.md
git commit -m "protocol: register table from official 288 app"
```

---

### Task 6: Cross-check and explain with Worthless Controls

**Files:**
- Modify: `protocol/registers.json`
- Modify: `docs/protocol.md` (add Worthless citations; a "Disagreements" subsection)
- Modify: `docs/decompile-notes.md`

**Interfaces:**
- Consumes: `registers.json` keys from Task 5.
- Produces: each entry gains a `worthless:` source where Worthless handles the same address; `confidence` raised to `medium` where the two agree on addr, type, scale; disagreements listed in `docs/protocol.md` §"Disagreements" and left `low`. `explain` improved from Worthless's English UI strings.

- [ ] **Step 1: Find Worthless's parameter model via leaked field names**

```bash
cd reference/decompiled/worthless
grep -rlE 'fluxWeakValue=|bmqHall=|enMaxPhaseCurr=' jadx/sources | head
```

Open the hit(s). It's a Kotlin data class `toString()`; the field order there matches the constructor, and the constructor is called from the frame parser. Follow the callers (`grep -rn '<ClassName>(' jadx/sources`) to the parser that maps register addresses to fields.

- [ ] **Step 2: Find the BLE UUIDs (built from longs)**

```bash
grep -rnE 'new UUID\(-?[0-9]+L, -?[0-9]+L\)|UUID\.fromString' jadx/sources | head
```

Convert `new UUID(msb, lsb)` to canonical form: `python3 -c "import uuid;print(uuid.UUID(int=((MSB & 0xFFFFFFFFFFFFFFFF)<<64)|(LSB & 0xFFFFFFFFFFFFFFFF)))"`. They must match `docs/protocol.md` §1; if not, record the difference under "Disagreements" — do not silently pick one.

- [ ] **Step 3: Cross-check checksum and framing**

```bash
grep -rnE '\^ *=|& *255|>> *8|0xAA|-86\b' jadx/sources/a | head -40
```

(`-86` is `0xAA` as a signed Java byte.) Confirm the algorithm from Task 4 is the same. Add `worthless:` citations next to the official ones in `protocol.md` §2–§4.

- [ ] **Step 4: Harvest English explanations**

```bash
python3 - <<'PY'
import json
s = json.load(open("reference/decompiled/worthless/strings/values.json"))
for k, v in sorted(s.items()):
    if len(v) > 40: print(f"{k}: {v}")
PY
```

Long strings are help text. Match them to registers by key name / field name and fold them into `explain` — rewritten in your own words, not pasted (spec: clean-room). Also read `files/motors.json` and `files/sotion_params.json`; document what they are in `decompile-notes.md` (motor presets? a different controller family?).

- [ ] **Step 5: Merge into `registers.json`**

For every register: add the `worthless:` source; if addr/type/scale agree → `confidence: "medium"`; if they disagree → keep `low`, add a `notes` line `DISAGREE: official says X, worthless says Y`, and add a row to `docs/protocol.md` §"Disagreements". Registers only Worthless knows about get added with `source: ["worthless:…"]`, `confidence: "low"`.

- [ ] **Step 6: Validate and commit**

Run: `uv run --project tools/registers tools/registers/validate.py` → `OK`.

```bash
git add protocol/registers.json docs/protocol.md docs/decompile-notes.md
git commit -m "protocol: cross-check register table against Worthless Controls, add explanations"
```

---

### Task 7: Telemetry frame layout

**Files:**
- Modify: `docs/protocol.md` (add §5 Telemetry)
- Modify: `protocol/telemetry.json`
- Modify: `tools/protocol/tests/test_frame.py` (add a telemetry decode test)
- Modify: `tools/protocol/fardriver_frame.py` (add `decode_telemetry`)

**Interfaces:**
- Produces: `decode_telemetry(frame: Frame) -> dict[str, float]` keyed by `telemetry.json` `key`s; `telemetry.json` populated.

- [ ] **Step 1: Find the live-data parser in both apps**

Official: the receive-path function from Task 4 step 2 — find the branch(es) that update speed/RPM/voltage/current/temperature properties. Worthless: the constructor call found in Task 6 step 1 is fed from the parser; find which command/frame ids it handles and the byte offsets read.

- [ ] **Step 2: Write `docs/protocol.md` §5**

```markdown
## 5. Telemetry (unsolicited frames)
After <trigger — e.g. subscribing / sending cmd X>, the controller streams frames with cmd <…> every <…> ms.
### Frame 0x<…>
| offset | size | field | type | scale | unit | source |
|---|---|---|---|---|---|---|
| … |
Fault flags: <bit table if any>
```

One subsection per distinct frame id.

- [ ] **Step 3: Populate `protocol/telemetry.json`**

One entry per field, `frame` = `"0xNN"`, `offset` per the table. Fault/status words go in as `type: "bitfield"` with `enum` mapping bit index → meaning.

- [ ] **Step 4: Write the failing test**

Append to `tools/protocol/tests/test_frame.py`, using a real telemetry frame if the decompiled code contains a sample or test vector; otherwise construct one by hand from the §5 table with known values (e.g. voltage 72.0 V → raw 720 at its offset) and assert the decoder returns those values:

```python
from fardriver_frame import decode_telemetry

def test_decode_telemetry_bus_voltage():
    raw = bytearray(<FRAME_LEN>)
    raw[0] = <HEADER>; raw[<cmd offset>] = <telemetry cmd>
    raw[<voltage offset>:<voltage offset>+2] = (720).to_bytes(2, "<endianness>")
    raw[-<cs size>:] = checksum(bytes(raw[:-<cs size>])).to_bytes(<cs size>, "<endianness>")
    assert decode_telemetry(decode(bytes(raw)))["bus_voltage"] == 72.0
```

- [ ] **Step 5: Run to verify it fails, implement `decode_telemetry`, run to verify it passes**

Run: `cd tools/protocol && uv run --group dev pytest -q` → fail with `ImportError`; implement by loading `protocol/telemetry.json` and slicing `frame.payload` per `offset`/`type`/`scale`; run again → all pass.

- [ ] **Step 6: Validate and commit**

Run: `uv run --project tools/registers tools/registers/validate.py` → `OK`.

```bash
git add docs/protocol.md protocol/telemetry.json tools/protocol/
git commit -m "protocol: telemetry frame layout and decoder"
```

---

### Task 8: Firmware update flow and read-flash answer

**Files:**
- Modify: `docs/protocol.md` (add §6 Firmware)
- Create: `docs/firmware-notes.md`
- Modify: `docs/decompile-notes.md`

**Interfaces:**
- Produces: `docs/firmware-notes.md` with the HTTP endpoint(s), request/response shape, and auth — the input to phase 3. `docs/protocol.md` §6 with the BLE bootloader command list and an explicit answer to "can firmware be read back?".

- [ ] **Step 1: Find the update flow in the official app**

```bash
cd reference/decompiled/official/src/MotorNet6
grep -rniE 'http[s]?://|HttpClient|RestClient|MQTT|\.bin"|firmware|upgrade|update|bootloader|boot' . | grep -viE 'System\.|Xamarin' | head -40
```

Note that `MQTTnet` is bundled — the update check may go over MQTT rather than HTTP. Record every host, path, topic, and query/body field.

- [ ] **Step 2: Find the version registers**

Which registers hold model / hardware version / firmware version (they should already be in `registers.json` from Task 5 — if not, add them now, group `misc`, `access: "r"`).

- [ ] **Step 3: Search for read-flash**

```bash
grep -rniE 'ReadFlash|Read.*Firmware|Dump|0x(0[3-9]|1[0-9])\b.*(flash|boot)' . | head
```

And in Worthless: `grep -rniE 'readflash|dump|bootloader' reference/decompiled/worthless/jadx/sources | head`. Whatever the result, write it down as a definite statement with citations.

- [ ] **Step 4: Write `docs/protocol.md` §6 and `docs/firmware-notes.md`**

`protocol.md` §6:

```markdown
## 6. Firmware update (BLE side)
- Entering bootloader: <command + citation>
- Chunk transfer: <command, chunk size, ack format>
- Verification: <checksum/CRC of image, how sent>
- Exit/reboot: <…>
- **Read-back:** <"No command reads flash; the bootloader protocol is write-only (official:…, worthless:…)" or what you found>
```

`firmware-notes.md`:

```markdown
# Firmware download — findings from the official 288 app

## Update check
- Transport: <HTTP/MQTT>
- Endpoint: <host/path or broker/topic>  (official:…)
- Request: <fields — model, hw version, fw version, app version, device id?>
- Auth/signing: <none / API key literal at … / HMAC computed in … >
- Response: <JSON shape; where the binary URL is>

## Binary
- URL pattern: <…>
- Encrypted at rest? <yes/no/unknown — evidence>
- Format: <raw bin / hex / vendor container>

## Open questions for phase 3
- <…>
```

- [ ] **Step 5: Commit**

```bash
git add docs/protocol.md docs/firmware-notes.md docs/decompile-notes.md protocol/registers.json
git commit -m "protocol: document firmware update flow and read-flash findings"
```

---

### Task 9: GDriver pass for unexplained parameters

**Files:**
- Modify: `protocol/registers.json`
- Modify: `docs/decompile-notes.md`

**Interfaces:**
- Consumes: `registers.json` entries whose `explain` still ends with "(effect unverified)" or whose `confidence` is `low`.
- Produces: those entries improved where GDriver has help text; `gdriver:` sources added.

- [ ] **Step 1: List what still needs explaining**

```bash
python3 -c "
import json
for e in json.load(open('protocol/registers.json')):
    if e['confidence']=='low' or 'unverified' in e['explain']: print(e['addr'], e['key'])"
```

- [ ] **Step 2: Search GDriver for each**

```bash
cd reference/decompiled/gdriver
grep -niE '<name fragment>' decompiled.js strings.txt | head
```

Also dump the English resource strings: `find jadx-en -name 'strings.xml' -exec grep -hE 'string name' {} +`. GDriver is a tuning app aimed at English speakers and tends to have tooltip text.

- [ ] **Step 3: Update entries, validate, commit**

Add `gdriver:` sources and improved `explain` where found. Leave `confidence` unchanged unless GDriver settles an official-vs-Worthless disagreement (then `medium` and remove the `DISAGREE` note, recording the resolution in `protocol.md`).

Run: `uv run --project tools/registers tools/registers/validate.py` → `OK`.

```bash
git add protocol/registers.json docs/decompile-notes.md docs/protocol.md
git commit -m "protocol: fill remaining explanations from GDriver"
```

---

### Task 10: Validation checklist generator and phase wrap-up

**Files:**
- Create: `tools/registers/gen_validation_md.py`
- Create: `tools/registers/tests/test_gen_validation_md.py`
- Create: `docs/validation.md` (generated)

**Interfaces:**
- Produces: `docs/validation.md` — a table with one row per register and per telemetry field: `addr/frame+offset | key | name | confidence | verified (yes/no/wrong) | note`, all `verified` cells initially empty. Phase 2 fills it in on the bike.

- [ ] **Step 1: Write the failing test**

`tools/registers/tests/test_gen_validation_md.py`:

```python
from gen_validation_md import render

def test_render_has_one_row_per_entry():
    regs = [{"addr": 43, "key": "phase_current_limit", "name": "Phase current limit", "confidence": "medium"}]
    tel = [{"frame": "0xE2", "offset": 4, "key": "bus_voltage", "name": "Bus voltage", "confidence": "low"}]
    md = render(regs, tel)
    assert "| 0x2B | phase_current_limit | Phase current limit | medium |  |  |" in md
    assert "| 0xE2+4 | bus_voltage | Bus voltage | low |  |  |" in md
    assert md.startswith("# Validation checklist")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tools/registers && uv run --group dev pytest -q tests/test_gen_validation_md.py` → `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`tools/registers/gen_validation_md.py`:

```python
#!/usr/bin/env python3
"""Generate docs/validation.md from protocol/registers.json + telemetry.json.

Usage: uv run --project tools/registers tools/registers/gen_validation_md.py > docs/validation.md
Re-running overwrites the file; keep filled-in rows by editing the JSON `confidence`
and re-generating, or hand-merge.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

HEADER = """# Validation checklist

Generated by `tools/registers/gen_validation_md.py`. Fill `verified` with
`yes`, `no`, or `wrong` while connected to the real controller; explain any
`wrong` in `note`. A register's `confidence` in `registers.json` is raised to
`high` only after a `yes` here.

"""


def render(registers: list[dict], telemetry: list[dict]) -> str:
    out = [HEADER, "## Registers\n\n| addr | key | name | confidence | verified | note |\n|---|---|---|---|---|---|\n"]
    for e in sorted(registers, key=lambda e: e["addr"]):
        out.append(f"| 0x{e['addr']:02X} | {e['key']} | {e['name']} | {e['confidence']} |  |  |\n")
    out.append("\n## Telemetry\n\n| frame+offset | key | name | confidence | verified | note |\n|---|---|---|---|---|---|\n")
    for e in sorted(telemetry, key=lambda e: (e["frame"], e["offset"])):
        out.append(f"| {e['frame']}+{e['offset']} | {e['key']} | {e['name']} | {e['confidence']} |  |  |\n")
    return "".join(out)


if __name__ == "__main__":
    regs = json.loads((ROOT / "protocol/registers.json").read_text())
    tel = json.loads((ROOT / "protocol/telemetry.json").read_text())
    sys.stdout.write(render(regs, tel))
```

- [ ] **Step 4: Run tests, generate the file**

Run: `cd tools/registers && uv run --group dev pytest -q` → all pass.
Run: `uv run --project tools/registers tools/registers/gen_validation_md.py > docs/validation.md && head -20 docs/validation.md`.

- [ ] **Step 5: Final consistency pass**

- `uv run --project tools/registers tools/registers/validate.py` → `OK`.
- `cd tools/protocol && uv run --group dev pytest -q` → all pass.
- Every `<…>` placeholder in `docs/protocol.md`, `docs/firmware-notes.md`, `docs/decompile-notes.md` is gone: `grep -n '<[^>]*>' docs/protocol.md docs/firmware-notes.md docs/decompile-notes.md` returns nothing (or only legitimate angle brackets you can justify).
- `git status` shows nothing under `reference/`.

- [ ] **Step 6: Commit**

```bash
git add tools/registers/ docs/validation.md
git commit -m "protocol: add validation checklist generator; phase 1 complete"
```
