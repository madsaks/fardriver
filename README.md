# FarDriver

A Web Bluetooth console for FarDriver motor controllers, backed by reverse-engineered protocol documentation, register metadata, and an evidence ledger derived from Android reference apps.

The web app is built with React, TypeScript, and Vite. Python tools validate protocol data, test frame encoding, and generate reference documentation. Controller and firmware compatibility still require hardware validation; metadata records confidence levels and source evidence.

## Features

- Live telemetry dashboard and raw RX/TX logs.
- Grouped controller settings with original-app limits, technical explanations, and validation confidence.
- Read-only startup, a backup gate before arming writes, and confirmation for individual setting writes.
- Passive JSON snapshots and full HEB dump requests, with JSON and HEB export.
- Settings hydration from received HEB data.
- Generic FarDriver and Segway E125S + FarDriver 72450 comparison profiles. Selecting a profile does not apply settings to the controller.
- A Segway exploration mode for BLE service discovery.
- Server-side diagnostic captures and a web app manifest/service worker.

## Run the web app

Prerequisites:

- A recent Node.js release compatible with Vite 7 and `pnpm`.
- The local `@xenapseai/ui-kit` package. **The current dependency is pinned to `file:/home/madsaks/ui-kit` in `web/package.json`.** A fresh clone needs that package at the configured path, or an updated dependency path and lockfile before installation.
- For controller access, a Bluetooth adapter and a browser exposing `navigator.bluetooth` in a secure context (HTTPS or localhost).

```bash
git clone https://github.com/madsaks/fardriver.git
cd fardriver/web
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:8787`. The development script binds to all interfaces. Remote browser access needs HTTPS for Web Bluetooth. The Vite configuration contains host-specific allowed hosts and an HMR client port of 443; adjust these for your environment if needed.

Build and preview from `web/`:

```bash
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 8787
```

The Vite dev and preview servers provide `/api/captures`, which writes JSON to `reference/captures/`. The app automatically submits device inventories and completed HEB dumps to that endpoint. A static host serving only `web/dist/` needs a separate capture backend for this functionality. The bundled capture endpoint has no authentication; keep access restricted to a trusted environment.

## Connect and back up

1. Select a vehicle profile and connect to a FarDriver controller through the browser's Bluetooth chooser.
2. Inspect telemetry and received settings. The FarDriver transport uses service `0xFFE0` and characteristic `0xFFEC` for writes and notifications.
3. In **Backup**, use **Run HEB dump** to request the controller's parameter stream. Wait for all **156 main words and 192 extended words** before exporting the HEB file.
4. Use **Snapshot JSON** to save currently observed register values, then **Export JSON** to download them. This snapshot is passive: it sends no register reads and may contain `null` for values not yet observed.
5. To change a supported setting, arm writes, review its value and limits, and confirm the individual write.

The backup gate is a software guard, not a guarantee that every controller parameter has been captured. **Import JSON** loads backup data into the session; it does not replay a restore to the controller. The current UI does not implement bulk restore or firmware flashing.

The Segway E125S comparison profile assumes 48 V and two 30 Ah packs (60 Ah total). Check those assumptions against your own vehicle before using its expected-value comparisons. Original-app limits are metadata, not confirmation that a value is suitable for a particular motor, battery, or firmware.

## Repository layout

| Path | Contents |
| --- | --- |
| [`web/`](web/) | React console, BLE transport, session logic, UI, and tests |
| [`protocol/registers.json`](protocol/registers.json) | Register definitions, limits, scaling, explanations, and evidence |
| [`protocol/telemetry.json`](protocol/telemetry.json) | Telemetry field definitions |
| [`protocol/schema/`](protocol/schema/) | JSON schemas for protocol metadata |
| [`protocol/api/`](protocol/api/) | Evidence indexes, curated command/safety ledger, and generated docs |
| [`tools/protocol/`](tools/protocol/) | Python frame codec and tests |
| [`tools/registers/`](tools/registers/) | Metadata validators, evidence indexer, documentation generators, and tests |
| [`tools/decompile.sh`](tools/decompile.sh) | Local reference-app extraction and decompilation workflow |
| [`docs/`](docs/) | Protocol findings, validation checklist, firmware notes, and design/planning documents |
| `reference/` | Local reference binaries, decompiled output, firmware, and captures; excluded from Git |

## Checks

Run the web tests and production build from `web/`:

```bash
pnpm test:run
pnpm build
```

Python tooling requires Python 3.11+ and `uv`. From the repository root:

```bash
uv run --project tools/protocol pytest tools/protocol/tests
uv run --project tools/registers pytest tools/registers/tests
uv run --project tools/registers tools/registers/validate.py
```

The API evidence validator also checks that indexed source files exist, so it requires the local decompiled references:

```bash
uv run --project tools/registers tools/registers/validate_api.py
```

Generate documentation from the tracked metadata:

```bash
uv run --project tools/registers tools/registers/gen_validation_md.py
uv run --project tools/registers tools/registers/gen_api_docs.py
```

## Reference apps

The research uses the official 南京远驱 288 app, Worthless Controls 5.1.16, and GDriver 3.4.0. The decompile script expects their source APK/XAPK files in `reference/apps/` and writes extracted output to `reference/decompiled/`.

Documentation is substantial but incomplete. The current metadata contains 110 registers (108 low-confidence, two medium-confidence) and 18 telemetry fields (15 low-confidence, three medium-confidence). Worthless Controls' native `libfd_protocol.so` was excluded from disassembly, leaving parts of its wire protocol unverified. The curated API ledger currently covers three commands, two file formats, one transport, and two safety rules; its app-options list is empty. Passing validators confirms metadata structure and source references, not complete APK coverage or hardware correctness.

**These binaries and extracted sources are local references, not tracked repository contents.** A GitHub clone includes the protocol metadata, evidence indexes, and documentation, but does not include the apps or decompiled files. References in the docs may therefore point to files absent from a fresh clone.

If you have the reference packages, inspect [`tools/decompile.sh`](tools/decompile.sh) for expected filenames and dependencies. It supports `--check`, `--install`, `--unpack`, and `--decompile`; running it without arguments installs the toolchain and performs all stages. Decompiled output can be indexed with `tools/registers/gen_decompile_index.py`.

## Further reading

- [BLE protocol and frame formats](docs/protocol.md)
- [Register and telemetry validation checklist](docs/validation.md)
- [Generated API reference](protocol/api/generated/README.md)
- [Decompilation findings and source evidence](docs/decompile-notes.md)
- [Firmware findings](docs/firmware-notes.md)
- [Protocol and web app design](docs/superpowers/specs/2026-09-21-fardriver-protocol-and-web-app-design.md)
