# FarDriver protocol, web app, and firmware download — design

**Date:** 2026-09-21
**Status:** approved in brainstorm, awaiting spec review
**Scope:** Project A. Project B (Segway Mobility app / E125S dash, BMS, ECU) is a
separate spec written after Project A phase 3.

## 1. Goal

Replace the existing FarDriver Android apps (Worthless Controls, GDriver, the
official 南京远驱 288 app) for a Segway E125S fitted with a FarDriver controller.
The existing apps are variously not in English, unreliable, or leave settings
unexplained. We want:

1. A **written protocol spec** and a **fully explained parameter table**, derived
   from decompiling the three apps and validated against the real controller.
2. A **web app** (Web Bluetooth, Chrome on Android) with a live dashboard and a
   settings editor where every parameter has a plain-English explanation.
3. A **firmware download tool** that fetches FarDriver controller firmware images
   from the vendor's update service so they can be inspected offline.

Explicitly out of scope: a native Android app (dropped), flashing firmware to the
controller, and anything Segway/Ninebot (Project B).

## 2. Decisions already made

| Question | Decision |
|---|---|
| Platform | Web app first (Web Bluetooth). No Kotlin app. |
| Test hardware | Controller installed in the E125S, reachable over BLE from the user's phone. Model unknown; read from the controller on first connect. |
| Serving | Vite dev server on fixed port **8787**, bound to `0.0.0.0`, as a `systemd --user` unit. User runs Caddy at `fardriver.madsaks.au` in front of it (TLS gives Web Bluetooth its secure context). Caddy config is the user's. |
| Approach | Spec-first, clean-room. Decompiled trees are reference only; no decompiled code is copied into `web/` or `tools/`. |
| Git | APKs, decompiled output, and downloaded firmware are gitignored. Only specs, `registers.json`, docs, and our code are committed. |
| Firmware read-back | Not expected to be possible via the app protocol (write-only bootloader, RDP on the MCU). Phase 1 checks explicitly and reports; server download is the planned route. |

## 3. Repo layout

```
fardriver/
├── reference/
│   ├── apps/                  # APKs/XAPKs (gitignored)
│   ├── decompiled/            # jadx / ilspy / hermes-dec output (gitignored, regenerable)
│   └── firmware/              # downloaded firmware images (gitignored)
├── tools/
│   ├── decompile.sh           # idempotent: install toolchain, unpack XAPKs, decompile all
│   └── fw-download/           # phase 3 firmware fetcher (Python, run with uv)
├── docs/
│   ├── protocol.md            # human-readable protocol spec
│   ├── validation.md          # per-register "verified on real controller" checklist
│   ├── firmware-notes.md      # update endpoint, request shape, signing/encryption findings
│   └── superpowers/specs/     # design docs (this file)
├── protocol/
│   └── registers.json         # single source of truth for every parameter
└── web/                       # Vite + TypeScript Web Bluetooth app
```

## 4. Phase 1 — Decompile and document

### 4.1 Toolchain (`tools/decompile.sh`)

All user-local, no root. Script skips tools already installed and apps already
decompiled.

| App | Stack | Tool |
|---|---|---|
| Worthless Controls 5.1.16 | Kotlin + Compose, one `classes.dex` | `jadx` (release zip → `~/.local/opt/jadx`) |
| 南京远驱 288 (official) | Xamarin/.NET, `assemblies/assemblies.blob` | `pyxamstore` (via `uv`) to unpack the blob, then `ilspycmd` (dotnet tool; .NET SDK via `dotnet-install.sh` → `~/.dotnet`) |
| GDriver 3.4.0 | React Native/Expo, Hermes `index.android.bundle` | `hermes-dec` (via `uv`) |

XAPKs are zips containing a base APK plus split APKs; the script extracts the
base APK (and the `config.en` split for string resources) before decompiling.

### 4.2 Hunt list, in priority order

1. BLE service and characteristic UUIDs; connect/subscribe sequence.
2. Frame format: header, address/command byte(s), length, checksum/CRC algorithm.
3. Read-register and write-register commands, and any unlock/password handshake
   required before writes.
4. The register table: for every address — name, data type, scaling, unit,
   min/max, enum values.
5. Telemetry (live-data) frame layout: which fields stream unsolicited and how
   often.
6. Explanation strings for parameters (Android `strings.xml`, Compose
   resources, .NET `.resx`), in any language.
7. Firmware: the update flow (version registers read, HTTP endpoint, bootloader
   protocol) and specifically **whether any read-flash command exists**.

Order of consultation: Worthless first (cleanest), 288 second (authoritative;
fills gaps and settles disagreements), GDriver only for parameters the other
two leave unexplained.

### 4.3 Outputs

**`docs/protocol.md`** — prose spec covering hunt items 1–3, 5, and 7, with a
worked byte-level example of at least one read and one write. Every example in
this file becomes a unit-test fixture in phase 2.

**`protocol/registers.json`** — one entry per parameter:

```json
{
  "addr": 43,
  "key": "phase_current_limit",
  "name": "Phase current limit",
  "type": "u16",
  "scale": 1,
  "unit": "A",
  "min": 0,
  "max": 600,
  "access": "rw",
  "group": "motor",
  "enum": null,
  "explain": "Peak current the controller will push through the motor windings. Higher = more torque but more heat; keep under the motor's rated peak.",
  "confidence": "high",
  "source": ["worthless:ParamTable.kt#L120", "official:ParamDefs.cs"]
}
```

Field rules:
- `addr` is the raw register address (decimal in JSON; hex in docs).
- `type` ∈ `u8 | i8 | u16 | i16 | u32 | i32 | bitfield | enum`.
- `scale` and `unit`: `displayed = raw * scale`, in `unit`.
- `access` ∈ `r | rw`.
- `enum`: `null` or a map of raw value → label.
- `explain`: written by us in plain English from the decompiled strings plus
  the parameter's actual behaviour. Never a bare translation of a cryptic label.
- `confidence` ∈ `high | medium | low`. `low` = the apps disagree or the
  explanation is a guess; must be verified in phase 2 before it is trusted.
- `source`: audit trail — where in the decompiled code each claim comes from.

## 5. Phase 2 — Web app

### 5.1 Serving

Vite + TypeScript. `vite.config.ts`: `server.port = 8787`, `server.host = true`,
`server.allowedHosts = ['fardriver.madsaks.au']`, `server.hmr.clientPort = 443`
so hot reload works through the TLS proxy. A `systemd --user` unit
(`web/fardriver-web.service`) keeps it running.

### 5.2 Structure

```
web/src/
├── protocol/            # pure functions, no browser APIs — unit-tested with vitest
│   ├── frame.ts         # encode/decode frames, checksum
│   ├── registers.ts     # loads ../../protocol/registers.json; typed accessors; scaling
│   └── telemetry.ts     # decodes the live-data stream into a typed object
├── ble/
│   └── connection.ts    # Web Bluetooth: request device, connect, subscribe, write, reconnect
└── ui/
    ├── Dashboard        # live telemetry: speed, RPM, volts, amps, temps, fault flags
    ├── Settings         # registers grouped by `group`; name/value/unit/explain; edit + write
    ├── RawLog           # every frame in/out as hex + decoded, filterable; export to file
    └── Backup           # dump all registers to JSON; restore from JSON
```

Data flow: `ble` emits raw bytes → `protocol/frame` validates and decodes →
`telemetry` / `registers` produce typed values → UI renders. Writes go the
reverse way and are verified by read-back before the UI reports "saved".

`registers.json` lives in `protocol/` at the repo root and is imported by the
web app via a Vite alias so there is exactly one copy.

### 5.3 Safety rails

- App starts in **read-only mode**; writes require a deliberate toggle.
- The first write in a session forces a full-register backup download first.
- Every write shows a confirm dialog: old → new value, in units, with the
  `explain` text.
- Values outside `min`/`max` are rejected client-side.
- The unlock/password handshake (if any) is only sent when leaving read-only
  mode.

### 5.4 Error handling

- Disconnect → auto-reconnect with exponential backoff; connection state is
  always visible in the UI.
- Checksum failure → frame dropped **and logged** in RawLog; never silently
  ignored, because that is how protocol mistakes surface.
- Write timeout or read-back mismatch → surfaced to the user; never assumed
  successful.
- Web Bluetooth unavailable (wrong browser, no TLS) → clear message on load.

### 5.5 Testing

- `vitest` for `web/src/protocol/`. Fixtures are the byte examples from
  `docs/protocol.md`; every claim in the spec has a test.
- `docs/validation.md`: every register listed with
  `verified: yes | no | wrong (note)`, filled in against the real controller.
  A register's `confidence` in `registers.json` is raised to `high` only after
  a `yes` here.

## 6. Phase 3 — Firmware download tool

### 6.1 What is reversed

The 288 official app's upgrade flow. Expected shape, to be confirmed: read
model/hardware/firmware version registers → HTTP(S) request to a FarDriver
endpoint (possibly with an app key or request signature) → manifest and binary
returned → streamed to the controller over a BLE bootloader protocol.

### 6.2 What is built

`tools/fw-download/` — Python, run with `uv run`:

- `fw-download list --model <MODEL>` — print firmware versions the server
  offers for that model.
- `fw-download get --model <MODEL> --version <VER>` — save binary, manifest,
  and the raw server response to `reference/firmware/<model>/<version>/`.

Each run appends findings to `docs/firmware-notes.md`: endpoint, request shape,
auth/signing, and whether the image is encrypted at rest.

### 6.3 Boundaries and risks

- **Download only.** No flashing. The BLE bootloader protocol is documented in
  `protocol.md` if found, but writing firmware is out of scope.
- The endpoint may need an account, a device-bound token, or an in-app
  signature; the tool reproduces whatever the app does.
- If images are encrypted with a key not recoverable from the app, the tool
  saves the encrypted blob and the notes say so. The user is told, not guessed
  at.

## 7. Phase order and hand-off

1. Phase 1 → commit `docs/protocol.md`, `protocol/registers.json`,
   `tools/decompile.sh`.
2. Phase 2 → commit `web/`, `docs/validation.md`; validate on the bike.
3. Phase 3 → commit `tools/fw-download/`, `docs/firmware-notes.md`.
4. Then brainstorm Project B (Segway Mobility app) as its own spec.

Each phase gets an implementation plan via the writing-plans skill before code
is written.
