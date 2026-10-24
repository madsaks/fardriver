# Cross-app API agreements and differences

Reviewed 2026-10-24 against the official 288 C# app, Worthless Controls 5.1.16 managed code and native library, GDriver 3.4.0 Hermes output, and this repository's Python/TypeScript codecs. This is a version-specific software comparison. Agreement across implementations is not a physical-controller validation result.

Native references below use ELF virtual addresses for the library fingerprint in [native-protocol.md](native-protocol.md). Exact local function paths and source lines are indexed in [`worthless-native.index.json`](../protocol/api/index/worthless-native.index.json). Managed app paths are relative to `reference/decompiled/`. Existing register-by-register citations and conflicting claims are retained in the [generated register reference](../protocol/api/generated/registers.md).

## Confirmed agreements

| Claim | Official evidence | Worthless evidence | GDriver / repository evidence | Result and confidence |
| --- | --- | --- | --- | --- |
| Write frame: `AA`, length command, duplicated address, little-endian payload, trailing CRC | `official/src/MotorNet6/MotorNet6/ParaPage.cs:2319–2334` | `ncFdBuildWritePacket`, ELF `0xe0c8`; JNI `0x18e78` | `web/src/protocol/frame.ts`, `tools/protocol/fardriver_frame.py`; GDriver classifier `decompiled.js:1362890–1362990` recognizes `AA C6` writes | High; 1,792 native cases match the framing; all 256 two-byte cases match the Python encoder |
| CRC tables and `(3C,7F)` initial state | `ConnectPage.cs:155–213,6196–6204` | Tables `0x779c/0x789c`; builders `0xe05c/0xe0c8`, RX checker `0x155bc` | Python `checksum`, TypeScript `checksum` | High for the native/official/Python comparison; TypeScript remains covered by its existing unit vectors |
| 55 RX indices map to the same logical pages | `ParaPage.cs:177–184` | Table at `0x760b`, dispatcher `0xdcfc` | The repository's `rx_frame` metadata uses that index convention | High; all 55 values compared directly |
| New RX family uses CRC, old/status family uses additive sum | `ConnectPage.cs:6187–6204,6282–6287` | Dispatcher `0xdcfc`, CRC checker `0x155bc` | Repository RX decoder | High for framing; all mapped native CRC pages accept valid and reject damaged frames; an additive-family frame sets the expected observation bit |
| Legacy HEB request `(19,7,10,56)` | `ConnectPage.cs:3759`; legacy builder `3947–3961` | `ncFdBuildOldCommand`, `0xe1cc` | GDriver `decompiled.js:1362938` classifies it as `read_flash`; web `backupHeb()` uses those arguments | High for packet construction/recognition, not delivery to every hardware family |
| Auto-learn start/exit: register 160, `88 02` / `88 03` | `GraphPage.cs:4295,4304` | Managed system-command wrapper `worthless/jadx/sources/p000a/w31.java:777` constructs `88, command`; native write API preserves it | GDriver `decompiled.js:1362980–1362983` | High for official/GDriver meaning; Worthless wrapper alone confirms construction, not which command its caller selects |
| Save parameters: register 160, `88 04` | `ParaPage.cs:3734`; `ProControlPage.cs:9305` | Same generic native write path | GDriver `decompiled.js:1362976–1362990`, value 1160 (`0x0488`) | High for the observed official/GDriver command |
| Restore product defaults: register 160, `88 08` | `ParaPage.cs:3502`; `ProControlPage.cs:9114` | Same generic native write path | GDriver classifier value 2184 (`0x0888`) | High for official/GDriver meaning; distinct from auto-learn default preset `88 0B` |
| Maximum line current uses raw / 4 A | `protocol/registers.json`, address 25, official sources cited there | Decoder `0x15744`, logical page 24; integer API field 5 and Java `data/C1253d.java:22` | Native raw 400 yields API integer 1000, Java /10 yields 100 A; repository scale 0.25 | High for recovered software conversion; hardware range remains unverified |
| Bus current is signed 16-bit / 4 A | `GraphPage.cs:1805–1810` | Decoder `0x15744`, logical page 232 | `protocol/telemetry.json`: `bus_current` | High; native synthetic raw −100 yields −25 A |
| Official/GDriver HEB layout uses 696 bytes and selected compact main ranges | `ConnectPage.cs:5891–5913`; read-side `gflash` mapping in `ParaPage.cs` | Worthless differs; see next table | GDriver `decompiled.js:894107–894150,894304,894458,894727`; web `heb.ts` | High for size/ranges; GDriver restore transport has separate hardware-specific options and decompiler limitations |

The [verification JSON](../protocol/api/native/verification.json) records the exact exercised domains. CRC agreement for ordinary register traffic does not establish agreement for every firmware or bulk-transfer checksum.

## Differences that must remain explicit

| Topic | Separate source claims | Interpretation / disposition |
| --- | --- | --- |
| Discrete register reads | Native `ncFdBuildReadPacket` at `0xe05c` emits `addr addr 80 CRC CRC` (5 bytes). Repository `encode_read` / `encodeRead` constructs `AA C4 addr addr CRC CRC` (6 bytes). Official app's streamed path does not supply a matching read call site. | **Confirmed difference, high confidence.** Preserve both claims. Do not describe the constructed repository helper as a verified Worthless read request. |
| Write size | Worthless core/JNI cap payloads at 14 bytes. Official `ConnectPage.WriteAddr` supports separate 316/388-byte bulk-transfer paths. | **Confirmed API limit difference.** Ordinary writes agree; APIs are not interchangeable for bulk restore. |
| Bus-voltage signedness | Official `GraphPage.cs:1805–1808` and tracked telemetry metadata use signed 16-bit /10. Native decoder at `0x15744`, logical page 232, reads unsigned 16-bit /10. | **Conflict at raw values ≥32768.** Normal positive values agree, including the tested 48.7 V case. Keep the original metadata and the native claim separately; no averaging or silent type change. |
| Regen curve representation, addresses 146–155 | Tracked official/GDriver-derived register entries are signed 8-bit with negative ranges. GDriver `decodeFarDriverSignedByte` at `decompiled.js:673305–673324` explicitly sign-extends. Worthless parser copies bytes and `ll0.java:1983–2003` converts curve byte arrays with `b & 255`. | **Different API representation; semantic agreement not established.** Raw `FF` can mean −1 as signed coefficient or 255 in an unsigned transport view. Preserve signed register types and cite the unsigned presentation separately. A byte array is not a u16 register definition. |
| HEB main-block word order | Official compact main addresses are `0–53`, `99–110`, `124–213`. GDriver's compact ranges are `[0,54)`, `[99,111)`, `[124,214)`. Worthless `C0205fk.java:163–177` writes raw indices 0–155 directly; `ll0.java:1524–1525` obtains the native 256-word logical-address array. | **Confirmed incompatibility, high confidence.** Native emulation places logical word 99 at raw index 99, not compact index 54. The first 54 main words align; later positions are not a valid official compact export. Matching file size/extension is insufficient. |
| HEB extended block | Official writes 192 words at byte offset 312 (`ConnectPage.cs:5899–5913`). Worthless allocates 696 bytes but fills only its first 312 (`C0205fk.java:167–179`). | **Confirmed difference, high confidence.** Worthless's remaining 384 bytes are zeros, not a captured CAN/extended backup. |
| Restore CRC generation | Ordinary native read/write state is `(3C,7F)`. GDriver HEB helpers select integer CRC seeds `0x7F3C` versus `0x7F3F` for hardware `'G'` (`decompiled.js:894107–894150,894261`). | **Hardware-specific variant, medium confidence.** Preserve the seed selection and GDriver evidence; no claim that ordinary writes share all bulk-restore rules. Some helper bodies are empty in the unsupported Hermes decompiler output. |
| Password data versus client authorization | Native `fdBuildPasswordData` encodes a 14-byte credential payload used by managed writes to registers 173/174 (`nk0.java:122,160,220,243`). Official client-ID handshake is a separate legacy/password frame (`protocol.md` §4.3). | **Different operations.** Do not use one format as evidence for the other's authorization semantics. |
| Firmware conditioning | Native `fdFwCondition` performs an enabled, page/word-limited XOR sequence. The official firmware notes describe cloud acquisition and bootloader transfer separately. | **Recovered native transformation, not an agreement claim about firmware authenticity or all app update pipelines.** Exact constants and tested boundaries are in `native-protocol.md`. |

## Existing parameter conflicts retained

The preceding research already records these unresolved interpretations, with per-app file/line sources in `protocol/registers.json` and the generated reference:

- Addresses 13/14: existing keys say throttle ADC, while official `ZeroBattCoeff`/`FullBattCoeff` names and GDriver's matching registry describe battery/SOC gauge endpoints.
- Addresses 18/27: LD/LQ labels versus GDriver's angle/switching-band interpretation for some controller designs.
- Address 30: forward/reverse “power” versus speed-ratio interpretation.
- Address 44: throttle deadband versus coast/electronic-braking transition meaning.
- Address 186: named pulse-timing bytes versus generic auxiliary/default-zero bytes.
- Address 189: SOC-style key versus field-weakening coefficient description.
- Address 194: inverse-time protection versus a combined reverse/Park/descent interpretation.
- Address 203: CAN-timeout unit interpretations (10-second units versus GDriver's 500 ms/2 ms-per-count descriptions).
- Address 207: regen acceleration naming versus the original reverse/re-acceleration descriptions.

These are not resolved by finding that frame builders agree. Every claim remains attached to its own source and confidence. Existing register confidence levels are not raised wholesale by the native analysis.

## How to extend the comparison

Keep transport bytes, decoded native API values, and UI display units as three distinct layers. Record each source's address, width, sign, scale, enum and hardware condition before comparing. A generic native writer accepting an address does not independently corroborate that address's meaning.

For a disagreement, retain both claims, give each a source and confidence, and state the exact input range or hardware condition where behavior differs. Use synthetic vectors or passive hardware evidence to narrow it; do not choose a majority value, average limits, or silently rewrite register metadata. Decompiler-inferred pointer arithmetic must be checked against assembly before declaring a conflict.
