# Technical coverage and verification

Snapshot: **2026-10-24**. Scope: the available FarDriver-related client protocol surfaces in official 288, Worthless Controls 5.1.16, and GDriver 3.4.0, including Worthless's AArch64 native library. Original packages, extracted app code, decompiler output and personal captures are excluded from Git.

## Reading map

| Area | Documentation / source of truth |
| --- | --- |
| BLE service, frames, CRC, commands, telemetry and official bootloader | [protocol.md](protocol.md) |
| Official cloud firmware acquisition and file/transfer findings | [firmware-notes.md](firmware-notes.md) |
| Native FarDriver API, packet formats, RX, arrays, firmware transformation and reproduction | [native-protocol.md](native-protocol.md) |
| Agreements, incompatible APIs/formats, and unresolved field claims | [api-agreements.md](api-agreements.md) |
| 110 registers, limits, enums, per-app evidence, confidence and caveats | [register reference](../protocol/api/generated/registers.md), `protocol/registers.json` |
| 18 telemetry definitions | `protocol/telemetry.json`, [protocol telemetry section](protocol.md#6-telemetry-unsolicited-frames) |
| Reviewed commands, app actions, formats and transport boundaries | [generated API reference](../protocol/api/generated/README.md) |
| All mechanically discovered source locations | [discovery inventory](../protocol/api/generated/discovery.md), `protocol/api/index/` |
| 186 native export addresses/signatures and 347 managed field declarations | [native catalog](../protocol/api/generated/native-api.md), [managed field catalog](../protocol/api/generated/managed-fields.md) |
| Hardware verification checklist | [validation.md](validation.md) |

## Discovery coverage

The source index now contains **1,479 records**, compared with 114 before this follow-up:

| Source | Records | What was indexed |
| --- | --- | --- |
| Official | 992 | 288 `WriteAddr` call sites, 252 legacy calls, 372 UI prompts/actions, 34 cloud calls, 33 BLE operations/UUIDs, 11 file read/write calls, two export markers |
| Worthless managed code | 84 | 24 FarDriver native declarations, 58 native call sites, one literal write call, one HEB export location |
| Worthless native code | 191 | 186 defined exports and five decoded-field/parser helpers |
| GDriver | 212 | 187 named protocol-related functions and 25 command-classifier/kind locations |

Discovery now handles multiline inline C# arrays and dynamic addresses. A record with no literal payload means the bytes require source review; it does not mean a zero-length write. Nearby assignment hints can miss branch-dependent values. Bilingual dialogs on a single line are deduplicated into one location.

The curated ledger covers **20 commands, 18 app actions, three file-format records, three transport records, and two safety rules**. Curated interpretations and mechanical discovery records remain separate. The native export catalog includes other supported protocol families so that JNI declarations are accounted for, while their wire behavior remains outside this FarDriver analysis.

The managed field catalog contains **199 configuration fields, 15 telemetry fields, and 133 preset fields**. It records declarations rather than asserting that each is an independent wire register or that model fields share a native integer-array layout. The 206-element native configuration result and Java conversion layer are documented separately.

## What was verified

- Ghidra imported/analyzed the 140,472-byte native ELF and exported 425 function listings locally, including wrappers, PLT thunks and runtime functions.
- Every one of the 93 managed native declarations is represented by a JNI export; the 93 core `nc*` exports are cataloged separately.
- The actual AArch64 code was executed offline for all 256 read addresses and 1,792 write cases. Tested write bytes match the documented official framing and Python CRC/encoder, including the native 14-byte cap.
- All 55 native RX index mappings match the official app table. Every mapped CRC page accepts a valid synthetic frame and rejects its checksum-damaged counterpart.
- Synthetic observations verify signed bus current, signed motor temperature, power calculation, maximum-line-current scaling, protocol-observation masks, and raw word placement.
- Firmware conditioning matches an independent reconstruction on 217,089 synthetic bytes and reverses when applied twice. Sync variants and selected credential/remote-drive packet layouts are checked in emulated memory.
- JSON metadata validation, evidence-ID uniqueness and source-line bounds are checked. Generated Markdown is reproducible from the ledger/index/metadata.

See the [machine-readable execution report](../protocol/api/native/verification.json) for exact vectors/domains. The emulator supplies memory/string import stubs. JNI allocation, Android Bluetooth behavior, cloud authentication, controller responses, motor movement and firmware flashing are not exercised by those checks.

## Differences and unresolved boundaries

The investigation has documented the available client evidence rather than suppressing disagreements to declare a universal protocol:

1. **Read requests differ.** Worthless emits five bytes, while the repository helper constructs six. The latter retains its documented constructed status; application behavior was not changed in this documentation pass.
2. **HEB exports differ.** Worthless copies logical words 0–155 rather than the official compact ranges and zero-fills the extended block. Treat those files as different backup representations.
3. **Types and meaning still have explicit conflicts.** Native bus-voltage signedness differs from the official claim. Signed regen coefficients and unsigned byte-array presentation remain distinct. Existing LD/LQ, battery coefficient, CAN timeout, reverse/regen, and other semantic conflicts remain attached to their sources.
4. **Hardware variants need hardware evidence.** Static app limits and cross-app agreement do not establish valid limits or feature support for a particular controller, firmware, motor or battery. Register/telemetry confidence remains unchanged: 108 low + two medium registers, 15 low + three medium telemetry definitions.
5. **GDriver decompilation is imperfect.** The Hermes tool warns that bytecode version 98 is unsupported. Some named helper bodies are empty and some closure references are damaged. Explicit literals, registry entries, and parser branches can support claims; missing bodies cannot prove an algorithm. Its HEB size/ranges and hardware-selected restore options are documented; the located firmware-update UI uses GEKOO labels and is not proof of a FarDriver firmware-download backend.
6. **Server behavior is not in the APKs.** Official MQTT topic matching and client authentication are documented, but exact server topic templates, broker policy and firmware authenticity cannot be established from these client files. `ConnectPage.cs:1518–1531` contains a subscription wrapper; no caller of that wrapper was found in the inspected C# source.
7. **DRM/ownership acceptance is unverified.** Native key/status surfaces are cataloged, but their controller-side semantics were not demonstrated. The report publishes no real credentials or generated key material.

These limitations are part of the technical reference. They must remain visible until source evidence or hardware observations resolve them.

## Reproduce the documentation

With the locally extracted references present, run from the repository root:

```bash
uv run --project tools/registers tools/registers/gen_decompile_index.py
uv run tools/protocol/native_inventory.py --index
uv run tools/protocol/verify_native.py --output protocol/api/native/verification.json
uv run --project tools/registers tools/registers/validate.py
uv run --project tools/registers tools/registers/validate_api.py
uv run --project tools/registers tools/registers/gen_api_docs.py
uv run --project tools/registers tools/registers/gen_validation_md.py
uv run --project tools/protocol pytest tools/protocol/tests
uv run --project tools/registers pytest tools/registers/tests
```

Native extraction/decompilation prerequisites and commands are in [native-protocol.md](native-protocol.md#reproduce-locally). A fresh GitHub clone can read all published findings, inventories and execution results; reproducing source-based analysis requires the excluded packages and local decompiled references. Documentation generators do not upload those references.
