# FarDriver

A Web Bluetooth console for FarDriver motor controllers, backed by reverse-engineered protocol documentation, register metadata, and an evidence ledger derived from Android reference apps.

The web app is built with React, TypeScript, and Vite. Python tools validate protocol data, test frame encoding, and generate reference documentation. Controller and firmware compatibility still require hardware validation; metadata records confidence levels and source evidence.

## Features

- Live telemetry dashboard and raw RX/TX logs.
- Grouped controller settings with original-app limits, technical explanations, and validation confidence.
- Read-only startup; a **complete HEB backup** is required before writes can be armed, and individual setting writes require confirmation.
- Passive JSON snapshots and full HEB dump requests, with JSON and HEB export. Passive/imported JSON no longer satisfies the write-safety gate.
- Settings hydration from received HEB data.
- Generic FarDriver and Segway E125S + FarDriver 72210 comparison profiles. The E125S profile records conservative 60 A baseline, 70 A recommended maximum and 80 A quick-setup ceiling values.
- A guided **Setup** screen for E125S power and acceleration tuning. Road-speed tuning remains preview-only until RPM-to-road-speed calibration is hardware-validated.
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
4. Use **Snapshot JSON** to save currently observed register values, then **Export JSON** to download them. This snapshot is passive: it sends no register reads and may contain `null` for values not yet observed. It does **not** unlock writes.
5. After the HEB dump is complete, arm writes, review the value and limits, and confirm the individual write.

The backup gate only opens after the expected HEB main and extended words have been received. **Import JSON** loads reference data into the session but deliberately keeps writes locked; it does not replay a restore to the controller. The current UI does not implement bulk restore or firmware flashing.

The Segway E125S profile assumes 48 V and two 30 Ah packs (60 Ah total) with the stock QS rear hub motor and a FarDriver 72210. The quick-setup power slider is intentionally capped at 80 A and marks 70 A as the recommended stock-profile maximum. See [`docs/e125s-power-envelope.md`](docs/e125s-power-envelope.md) for the evidence and remaining validation work. Original-app limits are metadata, not confirmation that a value is suitable for a particular motor, battery, or firmware.

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

The reference now includes [native protocol analysis](docs/native-protocol.md), an [API agreement/conflict report](docs/api-agreements.md), and a [coverage report](docs/coverage.md). Worthless Controls' AArch64 `libfd_protocol.so` has been decompiled locally; the published catalog contains 186 native exports and the verification results come from offline execution of the actual binary. The register metadata retains its individual confidence levels and unresolved conflicts. Passing validators or matching app implementations does not establish hardware compatibility.

Two confirmed compatibility differences matter: Worthless's five-byte native register reads differ from this repo's constructed six-byte read helper, and its HEB export does not reproduce the official compact main-word layout or extended block. See the agreement report before treating app APIs or backup files as interchangeable.

**These binaries and extracted sources are local references, not tracked repository contents.** A GitHub clone includes the protocol metadata, evidence indexes, and documentation, but does not include the apps or decompiled files. References in the docs may therefore point to files absent from a fresh clone.

If you have the reference packages, inspect [`tools/decompile.sh`](tools/decompile.sh) for expected filenames and dependencies. It supports `--check`, `--install`, `--unpack`, and `--decompile`; running it without arguments installs the toolchain and performs all stages. Decompiled output can be indexed with `tools/registers/gen_decompile_index.py`.

## Further reading

- [BLE protocol and frame formats](docs/protocol.md)
- [Register and telemetry validation checklist](docs/validation.md)
- [Generated API reference](protocol/api/generated/README.md)
- [Native protocol decompilation and reproduction steps](docs/native-protocol.md)
- [Cross-app agreements and conflicts](docs/api-agreements.md)
- [Coverage and verification limits](docs/coverage.md)
- [Decompilation findings and source evidence](docs/decompile-notes.md)
- [Firmware findings](docs/firmware-notes.md)
- [Segway E125S stock power envelope](docs/e125s-power-envelope.md)
- [Protocol and web app design](docs/superpowers/specs/2026-09-21-fardriver-protocol-and-web-app-design.md)
