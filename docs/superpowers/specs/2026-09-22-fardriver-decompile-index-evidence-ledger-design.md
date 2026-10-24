# FarDriver decompile index and evidence ledger - design

**Date:** 2026-09-22
**Status:** approved in brainstorm, awaiting spec review
**Scope:** FarDriver only. Segway controller/Bluetooth discovery is explicitly
out of scope for this spec, though the schema should not make it impossible to
add another protocol family later.

## 1. Goal

Build a machine-first FarDriver API reference from the decompiled official
FarDriver app, Worthless Controls, and GDriver. The first deliverable is not a
new web-app feature; it is a structured, source-backed knowledge base that can
later drive the web app safely.

The reference must answer:

1. Which app options exist, and what protocol operations do they trigger?
2. Which commands, registers, frames, file formats, and bulk operations are
known?
3. Which operations are passive, which are write-capable, and which are
dangerous enough to remain documentation-only?
4. Which claims are mechanically indexed from source, and which claims are
curated interpretations?

## 2. Architecture

The pipeline is:

```text
reference/decompiled/*
        |
        v
decompile indexer
        |
        v
protocol/api/index/*.index.json
        |
        v
protocol/api/ledger/*.json
        |
        v
generated docs + future web-app API
```

The index layer is mechanical evidence. It records call sites, strings, native
boundaries, UI handlers, file operations, command parser branches, and source
locations. It does not decide final semantics beyond basic classification.

The ledger layer is curated interpretation. It turns one or more index records
into protocol concepts such as `auto_learn_start`, `official_heb_export`, or
`restore_autolearn_defaults`, with confidence, safety, conflicts, and
implementation status.

This separation is important. A rerun of the indexer can update mechanical
evidence without overwriting human interpretation, and conflicting app behavior
can be represented honestly.

## 3. File Layout

The API reference lives under `protocol/api/` because the repo already keeps
protocol source data under `protocol/`.

```text
protocol/api/
  index/
    official.index.json
    worthless.index.json
    gdriver.index.json
  ledger/
    commands.json
    app-options.json
    file-formats.json
    transports.json
    safety.json
  generated/
    API.md
    COMMANDS.md
    APP_OPTIONS.md
    FILE_FORMATS.md
```

The existing `protocol/registers.json` remains the register source of truth for
known parameters. The ledger should link to register keys or addresses rather
than duplicate the whole register table. If a ledger finding implies a register
entry needs a safety or semantic update, the implementation plan should update
both the register entry and the ledger record.

## 4. Index Records

Index records describe source evidence.

```json
{
  "id": "official.ProControlPage.OnButtonResetClicked.9137",
  "app": "official",
  "source": {
    "path": "reference/decompiled/official/src/MotorNet6/MotorNet6/ProControlPage.cs",
    "line": 9137
  },
  "kind": "write_call",
  "symbol": "OnButtonResetClicked",
  "operation": "WriteAddr",
  "address": 160,
  "payload": {
    "bytes": [136, 11],
    "expression": "SendRS232L[4]=136; SendRS232L[5]=11"
  },
  "nearbyLabels": ["Use Auto Learn Default Config"],
  "confidence": "mechanical"
}
```

Required index fields:

| Field | Purpose |
|---|---|
| `id` | Stable identifier used by ledger evidence arrays. |
| `app` | `official`, `worthless`, or `gdriver`. |
| `source.path` / `source.line` | Local source reference. |
| `kind` | Mechanical classification. |
| `symbol` | Enclosing function/class/symbol when available. |
| `confidence` | For index records this is usually `mechanical`; unresolved records can be `partial`. |

Useful optional fields:

| Field | Purpose |
|---|---|
| `operation` | `WriteAddr`, `fdBuildWritePacket`, `fdBuildReadPacket`, command parser, file write, etc. |
| `address` | Visible register address, if statically known. |
| `payload` | Literal bytes or source expression. |
| `nearbyLabels` | UI labels, prompt text, strings, or option text near the evidence. |
| `notes` | Mechanical notes only; semantic conclusions belong in the ledger. |

Index record kinds should include at least:

```text
write_call
read_call
ui_option
string
file_read
file_write
native_api
bluetooth
command_parser
bulk_transfer
auth_security
firmware
remote_support
unknown
```

## 5. Ledger Records

Ledger records describe interpreted protocol/API concepts.

```json
{
  "id": "fardriver.command.restore_autolearn_defaults",
  "type": "command",
  "protocolFamily": "fardriver",
  "name": "Restore auto-learn default config",
  "transport": "ble",
  "operation": "WriteAddr",
  "address": 160,
  "payload": [136, 11],
  "safety": "destructive_config",
  "confidence": "high",
  "implementationStatus": "documented",
  "webAppPolicy": "display_only",
  "evidence": [
    "official.ProControlPage.OnButtonResetClicked.9137",
    "official.ParaPage.OnButtonResetClicked.3525"
  ],
  "notes": "Preset/config restore, not the same as live auto-learn start."
}
```

Required ledger fields:

| Field | Purpose |
|---|---|
| `id` | Stable protocol concept id. |
| `type` | `command`, `app_option`, `file_format`, `transport`, `register_relation`, or `safety_rule`. |
| `protocolFamily` | `fardriver` for this phase. |
| `name` | Human-readable title. |
| `safety` | Safety class from section 7. |
| `confidence` | `high`, `medium`, `low`, or `conflict`. |
| `implementationStatus` | Status from section 8. |
| `evidence` | List of index ids. |

Optional fields:

| Field | Purpose |
|---|---|
| `transport` | BLE, native, cloud, file, local-only. |
| `operation` | Protocol operation name. |
| `address` / `payload` | Register command details. |
| `fileFormat` | HEB, firmware image, exported text, JSON, etc. |
| `conflicts` | Explicit conflicts with other records or apps. |
| `webAppPolicy` | `display_only`, `hidden`, `read_only`, `armed_write`, `blocked`. |
| `notes` | Semantic notes and caveats. |

## 6. Indexer Scope

The first indexer should be practical, not magical. Use line-oriented scanning,
regular expressions, and small local parsers before considering full AST
parsing. The index is an evidence finder, not a proof engine.

### Official Xamarin/C#

Extract:

- `WriteAddr(...)` call sites.
- `SendRs232Data(...)`, `SendRs232DataPass`, and legacy command paths.
- `WriteSysCmd(...)`.
- `DisplayActionSheet`, `PromptAsync`, and labels near handlers.
- `.heb`, `.bin`, and `.hex` file read/write operations.
- MQTT/remote support topics related to binding, backup, import, or remote
  actions.
- BLE service/characteristic setup.
- Frame parser branches and checksum routines.

### Worthless/JADX

Extract:

- `fdBuildWritePacket(addr, payload)` call sites.
- `fdBuildReadPacket(addr)` call sites.
- `fdGetConfig` and `fdGetConfigRegisters` usage.
- Native API declarations.
- HEB export/import routines.
- `FardriverConfig` and `FdPreset` fields.
- User-visible strings tied to actions.

### GDriver JS Decompile

Extract:

- Command classifier/parser records.
- FarDriver operation objects, e.g. `fardriver.autoLearnStart`.
- Restore/default/profile/HEB functions.
- Parameter metadata and safety text.
- Support/admin read/write command surfaces.

Records should still be emitted when extraction is partial. For example,
obfuscated GDriver code may yield `kind: command_parser` without a clean symbol,
and Worthless native boundaries may yield `kind: native_api` without payload
layout.

## 7. Safety Classes

Ledger safety classes:

| Class | Meaning |
|---|---|
| `passive_observe` | Notifications, already-loaded config, exported snapshot. |
| `safe_read` | Known read command proven safe by app behavior or captures. |
| `guarded_write` | Normal parameter write; requires backup and explicit arming. |
| `bulk_restore` | Multi-register/block restore; requires stronger confirmation. |
| `destructive_config` | Reset, defaults, profile restore, learned-config restore. |
| `motion_or_autolearn` | Can spin motor, alter learned angle/throttle, or enter learn mode. |
| `firmware_update` | Bootloader, flash transfer, or bricking risk. |
| `auth_security` | Password, login, bind/unbind, key writes. |
| `unknown_danger` | Visible command/write with unclear effect. |

Dangerous commands must not default to `guarded_write`. If an operation can
move the bike, alter learned calibration, reset configuration, affect security,
or flash firmware, it gets its own stronger class.

## 8. Implementation Status

Ledger implementation states:

| Status | Meaning |
|---|---|
| `indexed_only` | Found mechanically, not interpreted yet. |
| `documented` | Interpreted and documented. |
| `implemented_read` | Supported safely in tools/web app. |
| `implemented_write` | Supported behind write gates. |
| `blocked_native` | Hidden in native library or obfuscation. |
| `do_not_implement` | Documented, but intentionally not exposed as an action. |

Example policy:

```json
{
  "id": "fardriver.command.auto_learn_start",
  "safety": "motion_or_autolearn",
  "implementationStatus": "do_not_implement",
  "webAppPolicy": "display_only"
}
```

## 9. Known Initial Ledger Targets

The first ledger pass should cover high-risk/high-value behavior before normal
settings:

1. Official HEB export: passive snapshot of 156 main words plus 192 extended
   words.
2. Official HEB import: bulk write of extended/CAN block and main block.
3. Worthless HEB export: 696-byte file with only the main 156 words populated;
   extended/CAN block is not a reliable backup.
4. GDriver/FarDriver auto-learn start: address 160, payload `[0x88, 0x02]`.
5. GDriver/FarDriver auto-learn exit: address 160, payload `[0x88, 0x03]`.
6. Official restore auto-learn default config: address 160, payload
   `[0x88, 0x0B]`.
7. Official restore defaults/reset/profile options: address 160 command family.
8. Official firmware-update command path and bulk transfer.
9. Password/unlock/security commands.
10. Registers 202 and 204 learn-related fields, marked dangerous until proven
    otherwise.

## 10. Generated Outputs

Machine data is the source of truth. Markdown is generated.

Generated files:

```text
protocol/api/generated/API.md
protocol/api/generated/COMMANDS.md
protocol/api/generated/APP_OPTIONS.md
protocol/api/generated/FILE_FORMATS.md
```

`API.md` should summarize coverage, confidence, and the safety model.
`COMMANDS.md` should group commands by safety class and source app.
`APP_OPTIONS.md` should map UI options to protocol operations.
`FILE_FORMATS.md` should document HEB/export/import and firmware file formats.

The existing `docs/validation.md` can remain the register validation table, but
generated API docs should link to it where relevant.

## 11. Validation

Validation should fail when:

- A ledger evidence id is missing from the index.
- A ledger source path does not exist locally.
- A ledger record is missing `confidence`, `safety`, or
  `implementationStatus`.
- A dangerous command is classified as `passive_observe` or `safe_read`.
- An address or payload byte is outside valid byte range.
- Generated docs are out of date with source JSON.
- A conflict exists only in prose instead of the `conflicts` field.

Conflict example:

```json
{
  "id": "fardriver.file.heb_export",
  "conflicts": [
    {
      "with": "worthless.heb_export",
      "summary": "Official exports main + extended blocks; Worthless fills only main block."
    }
  ]
}
```

## 12. Non-Goals

- No live Bluetooth probing as part of indexing.
- No controller writes in discovery tooling.
- No Segway protocol records in this phase.
- No guarantee that the first regex indexer perfectly resolves every GDriver
  bundled JavaScript operation.
- No web-app action exposure merely because a command is documented.

## 13. Open Questions For Implementation Planning

1. Whether to keep `protocol/api/ledger/commands.json` as one large list or
   split by command family once it grows.
2. Whether source excerpts should be hashed in the first version or added later.
3. Whether to normalize existing `protocol/registers.json` safety metadata in
   the same plan or a follow-up.
4. Whether GDriver bundled JS indexing needs a preprocessing step that extracts
   only FarDriver-relevant windows before regex scanning.

