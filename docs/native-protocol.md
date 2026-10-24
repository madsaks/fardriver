# Worthless Controls native protocol

## Artifact and evidence

Analyzed on 2026-10-24 from Worthless Controls 5.1.16. The library is in the XAPK's **`config.arm64_v8a.apk` split**, not its base APK:

| Property | Value |
| --- | --- |
| Member | `lib/arm64-v8a/libfd_protocol.so` |
| Format | ELF64, little-endian AArch64 |
| Size | 140,472 bytes |
| SHA-256 | `6d7b3f899c3c67ab2700c27c523a6aaf37efdd05d2d2f667da5ac60e809b471c` |
| Decompiler | Ghidra 11.0.3, headless automatic analysis |
| Address convention | ELF virtual addresses; add `0x100000` for this Ghidra import |

The local export contains 425 function listings, including JNI wrappers, PLT thunks and runtime functions. The metadata catalog records 186 defined native exports: 93 JNI methods and 93 `nc*` core functions. All 93 Java native declarations have corresponding JNI exports. Other supported families (ANT, Daly, Enerkey, JBD, JK, Sotion, VESC and Votol) are cataloged; the behavioral analysis here concerns FarDriver and shared session entry points.

Published artifacts contain authored descriptions, signatures, addresses, hashes, and synthetic observations. The `.so`, Ghidra project, C output, assembly, and original/extracted apps remain under gitignored `reference/`.

For exact local file/line references, see [`worthless-native.index.json`](../protocol/api/index/worthless-native.index.json) and the [native API catalog](../protocol/api/generated/native-api.md). A function identified as `ncFdBuildReadPacket` below corresponds to `reference/decompiled/worthless/native/export/0010e05c_ncFdBuildReadPacket.c:1`; the JSON index resolves every named core and JNI function similarly. Internal helpers are identified by their ELF addresses and `FUN_` export filenames.

Confidence **high** below means the behavior is directly visible in instructions and/or reproduced by the emulator. It does not mean tested on a physical controller. Field interpretations based only on decompiler types or damaged managed-code output remain **medium**, **low**, or **conflict** as stated.

## Offline verification

[`verify_native.py`](../tools/protocol/verify_native.py) maps the actual ELF into Unicorn's AArch64 emulator. It resolves ELF relocations and models only the memory/string imports required by the selected routines. It does not load the Android library into the host, call JNI, contact a server, or transmit Bluetooth data.

The checked-in [verification results](../protocol/api/native/verification.json) record:

- All 256 register-read addresses against an independently described five-byte format.
- 1,792 write cases: all 256 addresses, payload lengths 0, 1, 2, 6, 14, 15 and 20; truncation above 14 bytes; two-byte cases also compared to the repository's Python encoder.
- Four legacy commands, including the HEB request.
- All 55 native RX-index mappings against the official app's table.
- Four firmware sync variants and fallback to variant zero.
- Firmware conditioning over 217,089 synthetic bytes, compared to an independent implementation, then applied twice to verify reversibility.
- Three valid RX frames and their checksum-damaged equivalents, signed current/temperature decoding, power calculation, throttle conversion, and raw-400 to 100 A current scaling.
- All 55 mapped RX pages with valid/damaged CRCs, protocol-observation mask/reset, three synthetic password payloads, and three remote-drive packets executed only in emulated memory.
- Raw logical-address word placement, distinguishing native word 99 from official HEB compact offset 54.

## Register read: confirmed difference

**High confidence.** `ncFdBuildReadPacket` at **`0xe05c`**, wrapped by JNI `fdBuildReadPacket` at **`0x18de4`**, returns **five bytes**:

| Offset | Meaning |
| --- | --- |
| 0, 1 | Register address twice, reduced to one byte |
| 2 | `0x80` |
| 3, 4 | FarDriver CRC over the first three bytes |

There is no `0xAA` prefix. Examples executed from the native instructions:

| Address | Packet |
| --- | --- |
| 0 | `00 00 80 e1 9c` |
| 38 | `26 26 80 1a 37` |
| 160 | `a0 a0 80 99 be` |
| 255 | `ff ff 80 90 5c` |

The official app primarily consumes streamed parameters rather than exposing a matching discrete read builder. The repository's existing `encode_read` / `encodeRead` constructs a six-byte zero-payload write-shaped frame. That constructed frame is **not equivalent to Worthless's native read API**. This documentation update preserves the codecs' behavior and records the difference instead of silently changing the web app.

## Writes and CRC

**High confidence.** `ncFdBuildWritePacket` at **`0xe0c8`**, JNI wrapper **`0x18e78`**, produces:

`AA, C4 + payloadLength, address, address, payload..., CRC-byte-1, CRC-byte-2`

The core and JNI wrapper both cap the payload at **14 bytes**; the returned size is `payloadLength + 6`, at most 20 bytes. The core's length parameter is assumed nonnegative by its Java caller; negative lengths are outside the verified input domain. Addresses are narrowed to one byte.

The CRC state starts at `(0x3C, 0x7F)`. The tables are at ELF addresses **`0x779c`** and **`0x789c`**. They and the running-state update agree with the official C# builder and the repository's Python CRC for every tested write. The final two state bytes are appended in the same order as the official builder. See [protocol §3](protocol.md#3-checksum) for that convention; calling it simply “Modbus CRC” omits the nonstandard seed.

The cap is a Worthless API limit. It must not be generalized to the official app's 316/388-byte parameter transfers, which have separate chunking paths.

## Legacy commands and remote drive

**High confidence.** `ncFdBuildOldCommand` at **`0xe1cc`** returns eight bytes:

`AA, command, ~command, subcommand, value1, value2, sum, ~sum`

Here `sum = (0xA9 + subcommand + value1 + value2) & 0xFF`; complements are one-byte complements. This agrees with the official `SendRs232Data` algorithm. `(19, 7, 10, 56)` is the full HEB dump request, independently visible at official `ConnectPage.cs:3759` and recognized as `read_flash` by GDriver at `decompiled.js:1362938`.

`ncFdBuildRemoteDrive` at **`0x10084`**, JNI **`0x19e24`**, returns a distinct **17-byte** frame beginning `AA FC`. Bytes 2–3 repeat the first argument, bytes 4–5 and 6–7 contain the low 16 bits of the next two arguments, and bytes 8–14 are zero. Bytes 15–16 are the FarDriver CRC over bytes 0–14. This layout is statically recovered and checked with three emulator vectors; it is not a normal register-write frame and its controller-side argument meanings are not established by the signature. **High confidence for packet layout, medium for interpretation; motion-capable, documentation only.** No remote-drive packet was transmitted.

## RX parsing and session state

**High confidence for the framing and tested paths.** `ncFdHandleNotification` at **`0xdca0`** accepts session handles 0–7, requires at least 16 input bytes, and requires the session's type to equal 1. Its dispatcher at **`0xdcfc`** checks `AA` at byte zero and processes one 16-byte frame. The core does not iterate additional concatenated frames; transport callers must handle packet boundaries.

| RX family | Integrity check | Dispatch |
| --- | --- | --- |
| Byte 1 top bit set | FarDriver CRC over bytes 0–13, compared with bytes 14–15 | Low seven bits select a logical page |
| Byte 1 top bit clear | 16-bit byte sum over bytes 0–13, high byte at 14, low byte at 15 | Legacy/status handler at `0x149e4` |

The CRC checker is at **`0x155bc`**. The **55-byte table at `0x760b` matches all 55 entries** in official `ParaPage.cs:177–184`, including repeated telemetry pages. Pages beyond index 54 can pass CRC and return success, but bypass the mapped-field update. Therefore a successful parse does not imply the page was decoded.

`fdGetProtocolSeen` / `fdResetProtocolSeen` expose/reset a local mask: **1** for accepted additive/legacy-family frames, **2** for accepted CRC/new-family frames. This is an observation mask, not a capability negotiation result.

The native library maintains eight session slots. `createSession(type)` allocates a slot and `destroySession(handle)` clears its state; FarDriver's notification path expects type 1. Getter guards vary: some check only the handle range, whereas the notification path also checks session type. Do not interpret a default-valued getter as proof of a connected controller.

## Configuration and telemetry APIs

`ncFdGetConfig` at **`0xef9c`** returns **206 integers** when the supplied output capacity is at least 206. JNI `fdGetConfig` at **`0x19174`** constructs the same-sized Java array. This is a decoded API structure, not a sequence of 206 wire registers. Its field mapper is `FUN_0010b668` (ELF **`0xb668`**); Java `data/C1253d.java:12` converts fixed-point API integers to UI values.

`ncFdGetRawConfigWords` at **`0xf4c4`** returns **256 zero-extended 16-bit words** in a 256-element integer array. This is distinct from both the decoded configuration structure and the official compact 156-word HEB main block.

`ncFdGetRpmCurve` at **`0xf264`** returns 18 bytes; `ncFdGetNRatio` at **`0xf324`** returns 20 bytes. Instruction review confirms a consistent session stride of `0x19e0` and contiguous byte loads for the latter, including element 12 at instruction **`0xf3a8`**. Ghidra renders that element with different inferred pointer arithmetic; that is a decompiler type artifact, not evidence of a different wire format or session stride.

`ncFdGetTelemetry` at **`0xe010`**, helper **`0xb55c`**, returns 15 floats. Java `ll0.java:1973–1975` passes them into `FardriverTelemetry` in this order:

| Index | Field | Native derivation |
| --- | --- | --- |
| 0 | RPM | Decoded rotation, with motor pole-pair adjustment |
| 1 | Speed | Derived using wheel/drivetrain configuration |
| 2 | Bus voltage | Unsigned 16-bit value / 10 |
| 3 | Bus current | **Signed** 16-bit value / 4 |
| 4 | Power | Voltage × current |
| 5, 6 | Phase A, C | Square roots of separate 24-bit quantities × 1.953125 |
| 7 | Motor temperature | Signed 16-bit value converted to float |
| 8 | Controller temperature | Signed 16-bit value converted to float |
| 9 | Throttle percentage | Raw/384 × 100, or endpoint-calibrated/clamped voltage conversion |
| 10 | Modulation | Decoded fractional value × 100 |
| 11 | Gear | Decoded scalar, not the complete status word |
| 12 | SOC | Decoded byte |
| 13 | Throttle raw | Unsigned 16-bit value |
| 14 | Throttle voltage | Decoded voltage, also used by endpoint calibration |

Wire-to-field decoding is at **`0x15744`**, with logical page 232 for voltage/current, 238 for phase quantities, and 244 for motor temperature/SOC. A synthetic 48.7 V, −25 A frame returned −1217.5 W; motor temperature −7 survived signed conversion. The current scaling at raw register 25 is `/4` A, matching official metadata; the intermediate API integer is ×10 and Java divides it by 10 again.

The native getter and Java presentation are separate sources: byte-preserving curve reads and Java's `b & 255` conversion do not prove the physical meaning of a signed regen coefficient. The [agreement report](api-agreements.md) preserves that uncertainty and the existing signed register claims.

## Polling and configuration pages

**High confidence.** `ncFdGetPollRegisters` at **`0xf3f4`** returns 13 logical page addresses:

`226, 232, 238, 244, 250, 214, 36, 42, 48, 24, 105, 124, 208`

`ncFdGetConfigRegisters` at **`0xf42c`** returns 27:

`160, 166, 99, 105, 18, 208, 36, 24, 30, 42, 48, 190, 196, 6, 12, 154, 148, 124, 244, 136, 142, 0, 130, 184, 202, 34, 172`

These are not sequential individual register numbers and must not be confused with RX frame-index bytes. Capacity parameters bound the returned list lengths. The arrays are reproduced in the verification JSON.

## Password, product information, and DRM surfaces

`ncFdBuildPasswordData` at **`0xef30`** produces a 14-byte, zero-filled value. Byte zero is `(0xB0 + original string byte length) & 255`; up to 13 string bytes follow. A null string gives a leading `B0`. JNI `fdBuildPasswordData` uses `GetStringUTFChars`, so this is modified UTF-8 byte length, not Java character count. **High confidence for layout; long/non-ASCII credential compatibility is untested.** Managed `nk0.java:122,160,220,243` uses this data in register writes to 174 or 173.

This is distinct from the official app's client-ID unlock handshake. It must not be conflated with authorization, ownership, or a portable shared credential. No real credentials were collected or used.

The remaining FarDriver getters are `fdGetErrorMessage`, `fdGetModelType`, `fdGetProductCode`, `fdGetStoredPassword`, and the local-state setter `fdSetProductInfo`. They expose parsed/session-local state, not cloud service APIs. Source symbols and ELF addresses are in the catalog.

`ncFdGenerateDrmKey` at **`0xf6fc`** and `ncFdGetDrmStatus` at **`0xff74`** are present, with JNI wrappers at **`0x19d14`** and **`0x19dbc`**. They operate on session/product state. Their presence is not evidence that the phone calls them in the inspected flows, or that the controller accepts their results. They were statically inventoried, not validated as an authorization mechanism. No key material is published.

## Firmware conditioning

**High confidence for the recovered transformation.** Both core `ncFdFwCondition` at **`0xe20c`** and JNI `fdFwCondition` at **`0x18a28`** copy the input. If the mode argument is nonzero, they apply this reversible transformation:

- Divide the file into 2,048-byte pages, numbered from zero.
- Start each page with 16-bit state `(page × 0x3E41 + 0x9BCF) mod 65536`.
- Visit little-endian 16-bit words in that page. Only pages **5 through 103 inclusive**, and word indices **0 through 201 inclusive**, are XORed with the current state.
- Advance state after each visited word: `(state × 0x549D + 0x6E45) mod 65536`.
- Preserve an incomplete trailing byte. Mode zero copies without transformation.

The nonzero mode acts as an enable switch; its numeric value is not used as a cryptographic key. Applying the same transformation twice restores the input. This resolves the previous “opaque native firmware conditioning” question; it does not establish firmware authenticity, signing, or server-side protections.

The managed caller `p000a/w31.java:458–467` uses this transformation for binary files larger than 131,072 bytes when its mode flag is nonzero. Smaller-file branches copy their data. Do not infer that every image or hardware family uses this transformation.

## Firmware sync

**High confidence.** Core `ncFdFwSync` at **`0xe304`** and JNI `fdFwSync` at **`0x18bd0`** expose four eight-byte packets. Their stored tails are XOR-obfuscated with `0x5A`; that storage transform is not on-wire encryption.

| Variant | Packet |
| --- | --- |
| 0 | `55 aa 33 30 33 3c fd fe` |
| 1 | `55 87 9d 18 72 f0 1a c4` |
| 2 | `55 aa 33 30 33 49 fd fe` |
| 3 | `55 aa 04 05 06 00 fd fe` |

An unsigned variant outside 0–3 falls back to variant zero. These are bootloader traffic; documenting them does not add flashing support to the web console. Official bootloader behavior remains separately documented in [protocol §7](protocol.md#7-firmware-update-ble-side).

## Reproduce locally

From the repository root, with the original Worthless XAPK already available locally:

```bash
uv run tools/protocol/native_inventory.py --extract
mkdir -p reference/decompiled/worthless/native/ghidra-project
```

Set `GHIDRA_HOME` to your Ghidra 11.0.3 installation, then:

```bash
"$GHIDRA_HOME/support/analyzeHeadless" \
  "$PWD/reference/decompiled/worthless/native/ghidra-project" fd_protocol \
  -import "$PWD/reference/decompiled/worthless/native/arm64-v8a/libfd_protocol.so" \
  -scriptPath "$PWD/tools/protocol" \
  -postScript ExportNative.java "$PWD/reference/decompiled/worthless/native/export" \
  -analysisTimeoutPerFile 300 -deleteProject
uv run tools/protocol/native_inventory.py --index
uv run tools/protocol/verify_native.py --output protocol/api/native/verification.json
uv run --project tools/registers tools/registers/validate_api.py
uv run --project tools/registers tools/registers/gen_api_docs.py
```

Java 17 was used for this Ghidra version. Different Ghidra versions or import bases can change decompiled filenames and line numbers; regenerate and review the metadata before reusing those citations. Runtime stubs or compiler artifacts may decompile poorly; only the described paths were behaviorally exercised.
