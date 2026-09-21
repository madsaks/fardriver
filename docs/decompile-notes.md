# Decompile notes

Regenerate everything with `tools/decompile.sh --unpack && tools/decompile.sh --decompile`
(or `tools/decompile.sh all` to also install/check the toolchain first).
Output is in `reference/decompiled/` (gitignored, never commit it).

Note: `Segway+Mobility_6.10.10_APKPure.xapk` in `reference/apps/` is out of scope for this
project and is not touched by `tools/decompile.sh`.

## Official 288 (Xamarin)

- `reference/decompiled/official/blob/assemblies/` — raw `assemblies.blob` (XABA v1) +
  `assemblies.manifest` extracted from the APK.
- `reference/decompiled/official/assemblies/*.dll` — all 104 assemblies unpacked by
  `pyxamstore unpack -d .`. Confirmed: pyxamstore writes to `./out/` next to the blob
  (`assemblies/out/*.dll`), matching the brief's assumption exactly.
- Logic: `reference/decompiled/official/src/MotorNet6/MotorNet6/` — all app code sits
  directly in a single `MotorNet6` namespace (no `MotorNet6.Services` / `MotorNet6.Models`
  sub-namespaces). 32 `.cs` files, all Xamarin.Forms `ContentPage` code-behind + a few data
  models, e.g.: `ConnectPage`, `ParaPage`, `ProControlPage`, `ProBmsPage`, `CurvePage`,
  `GraphPage`, `RecordPage`/`SegRecordPage`/`MonthRecordPage`, `StatPage`, `MapPage`,
  `LoginPage`/`LoginPage2`, `BindDevice`, `DeviceMsg`, `VCUData`, `VCUSMsg`, `Record`,
  `RecordData`, `ScanResultModel`, `CMD5` (likely a checksum/CRC helper — worth checking
  first for the BLE frame protocol).
- Android glue: `reference/decompiled/official/src/MotorNet6.Android/MotorNet6.Droid/` —
  `MainActivity`, `SplashScreen`, generated `Resource`; plus
  `MotorNet6.Droid.Renderers/PDFViewRenderer.cs`.
- BLE plumbing: `reference/decompiled/official/src/Plugin.BLE` and
  `Plugin.BLE.Abstractions` — third-party (Plugin.BLE nuget), not FarDriver-specific. The
  actual BLE write/notify calls and frame parsing live in `MotorNet6/*.cs` (e.g.
  `ConnectPage.cs`, `DeviceMsg.cs`, `VCUSMsg.cs`), which call into Plugin.BLE.
- Gotchas: none. `pyxamstore unpack` and all 4 `ilspycmd -p -o ... --referencepath ...`
  invocations (`MotorNet6`, `MotorNet6.Android`, `Plugin.BLE`, `Plugin.BLE.Abstractions`)
  exited 0 with no reported errors. `ilspycmd` requires `DOTNET_ROOT` to be exported (the
  script already does this); running it without that env var fails with "You must install
  .NET to run this application."

### Official → BLE (Task 4 findings)

All of the following are in `MotorNet6/ConnectPage.cs` unless noted; line numbers are from
`reference/decompiled/official/src/MotorNet6/MotorNet6/`.

- **UUIDs**: `ConnectPage.cs:94` declares `commUUID = new Guid(65516, 0, 4096, new byte[8]
  {128,0,0,128,95,155,52,251})` and `ConnectPage.cs:96` declares `commHeadUUID = new
  Guid(65504, 0, 4096, new byte[8] {128,0,0,128,95,155,52,251})`. Both use the standard
  Bluetooth SIG base UUID (`...-0000-1000-8000-00805F9B34FB`), so these are 16-bit assigned
  UUIDs 0xFFE0 and 0xFFEC respectively: `0000FFE0-0000-1000-8000-00805F9B34FB` and
  `0000FFEC-0000-1000-8000-00805F9B34FB`.
- **Service/characteristic discovery**: `OnDeviceStateChanged` (`ConnectPage.cs:6108`) calls
  `bluedevice.GetServicesAsync()` and picks the service whose GUID bytes (`Guid.ToByteArray()`)
  have `array[0]==224 (0xE0)` and `array[1]==255` — `ConnectPage.cs:6113,6122` — i.e.
  `commHeadUUID`/0xFFE0. It then calls `service.GetCharacteristicsAsync()` and picks the
  characteristic whose bytes have `array2[0]==236 (0xEC)` and `array2[1]==255` —
  `ConnectPage.cs:6131,6134` — i.e. `commUUID`/0xFFEC. **The same single characteristic
  (`chs`) is used for both `WriteAsync` and `ValueUpdated`/`StartUpdatesAsync`** —
  `ConnectPage.cs:6144,6154` — there is no separate write-only/notify-only characteristic.
  No `WriteType` is ever set on `chs`, so the app relies on Plugin.BLE's default write type
  for whatever the characteristic's GATT properties advertise (no explicit
  with-response/without-response choice found in `MotorNet6/*.cs`).
- **Advertised name filter**: `ConnectPage.cs:1639` accepts scan results whose name
  (uppercased) contains `"YUANQU"`, `"CONTROL"`, or `"BMS"`. `ConnectPage.cs:2842,2849` parse
  a 7-digit serial out of the device name at a fixed offset (`Name.Substring(6, 7)`) when the
  name contains `"YUANQU"`, and `ConnectPage.cs:1668` matches names containing `"YUANQU0"`
  specifically for reconnect-by-last-name. So VCU controllers advertise as
  `YUANQU0<7-digit serial>` (远驱 = "Yuanqu", the manufacturer name in pinyin); other
  FarDriver-family devices (Pro controller / BMS) advertise names containing `CONTROL`/`BMS`.
- **No MTU negotiation**: no `RequestMtuAsync`/`MtuSize` call anywhere in `MotorNet6/*.cs`.
  Consistent with this, `WriteAddr`'s large-payload path (`ConnectPage.cs:4329`, cases
  `len==388`/`len==316` at `ConnectPage.cs:4339,4342`) manually splits the frame into 20-byte
  `chs.WriteAsync` sub-packets (`ConnectPage.cs:4372,4395`) with a 10ms sleep between each —
  i.e. the app assumes the default (un-negotiated) ATT MTU of 23 bytes (20-byte payload).
- **RX framing** (`SetReadValue`, `ConnectPage.cs:6162-6364`): reassembles the characteristic's
  notify stream into fixed **16-byte** frames — both RX families below are 16 bytes; there is
  no 8-byte RX path (an earlier draft of this note wrongly called the second family "a legacy
  8-byte 'download' path ... not used for register I/O" — corrected here and in
  `docs/protocol.md` §2/§4.4). Byte 0 must be `0xAA` (170) to start a frame (`ConnectPage.cs:6174`);
  byte 1's top bit (`0x80`) selects which of the two families applies (`ConnectPage.cs:6187`,
  `(m_Received[1] & 0x80) == 128`):
  - **Top bit set** — the general telemetry/parameter frame (index = `cmd & 0x7F`, 0-127,
    including index values ≥64 whose cmd byte, 0xC0-0xFF, looks like a TX command-frame cmd
    byte — e.g. index 72 is `cmd=0xC8`; only RX-vs-TX direction disambiguates them, not the
    byte value). Checksum is verified over bytes 0-13 against bytes 14-15
    (`ConnectPage.cs:6196-6204`) using the table-based CRC16 (see below).
  - **Top bit clear** — a second, rarer frame family, still handled inline in the same
    function (`ConnectPage.cs:6272-6360`). Checksum is a *different* algorithm: a plain 16-bit
    additive sum over bytes 0-13 (`ushort rcv_crc`), compared **high byte first** —
    `m_Received[14] == rcv_crc>>8 && m_Received[15] == (rcv_crc & 0xFF)`
    (`ConnectPage.cs:6282-6287`). Two cmd values actually occur in this codebase:
    - `cmd=0x1F` (31): firmware/download acknowledgement. `m_Received[2]==m_Received[3]` (a
      duplicated sub-command byte, structurally similar to `WriteAddr`'s address duplication);
      switch on that byte selects ack/nack/CRC-seed behavior (`ConnectPage.cs:6290-6349`).
    - `cmd=0x7C` (124, matched via `(m_Received[1] & 0xFC) == 124`,
      `ConnectPage.cs:6350-6357`): the **serial-number/login-trigger frame**. Bytes 2-5 are
      the controller's serial as a little-endian uint32, decoded into
      `App.rcv_serialNumber`; receiving this frame also sets `logincount = 0`
      (`ConnectPage.cs:6357`) — see "Unlock trigger" below.
- **CRC16 tables**: `crctablelo`/`crctablehi` (256-byte tables each, `ConnectPage.cs:155,185`;
  duplicated verbatim in `GraphPage.cs`, `CurvePage.cs`, `StatPage.cs`, `ParaPage.cs`,
  `ProControlPage.cs`) are byte-for-byte identical to the standard CRC-16/MODBUS lookup
  tables (verified by comparing against a bitwise CRC-16/MODBUS reference implementation with
  the standard `0xFFFF` init — table output matches once byte order is accounted for). The app
  uses a **non-standard initial register value** of `(0x3C, 0x7F)` instead of the standard
  `(0xFF, 0xFF)` — see `ConnectPage.cs:6196-6197` (RX) and `ConnectPage.cs:4351-4352` /
  `ParaPage.cs:2326-2327` (TX, `WriteAddr`). Algorithm translated to Python in
  `tools/protocol/fardriver_frame.py::checksum`.
- **TX framing — `WriteAddr`** (`ParaPage.cs:2319`, simplified single-page version;
  `ConnectPage.cs:4329` has the same algorithm plus the >255-byte chunked-send special case):
  given a data buffer, a register `addr`, and payload `len`: `data[0]=0xAA`; `len+=4`;
  `data[1]=0xC0+len` (so the length is encoded in the low 6 bits of the second byte, with the
  top 2 bits fixed at `11`); `data[2]=data[3]=addr` (address is duplicated into both byte 2
  and byte 3); payload occupies `data[4:4+len-4]` (already placed by the caller before
  calling `WriteAddr`); then the same CRC16 (custom init) runs over `data[0:len]` and the
  two result bytes are written to `data[len]`, `data[len+1]`.
- **No explicit "read register" command found.** Every `WriteAddr`/`SendRs232Data` call site
  in `MotorNet6/*.cs` is a *write* (`len` is always the payload length being written, never
  0). Register values instead arrive unsolicited: once connected (and, for `NewVersion`
  controllers, "unlocked" — see below), the controller continuously streams 16-byte frames
  over the notify characteristic; `SetReadValue` (`ConnectPage.cs:6162`) demultiplexes them by
  the low 7 bits of byte 1 and republishes each as a `"ReadParaMeter"` message
  (`ConnectPage.cs:6230-6235`); each page (e.g. `ParaPage.cs:857`) subscribes and further maps
  that 7-bit index through its own `FlashReadAddr[55]` lookup table (`ParaPage.cs:177`) to a
  logical parameter id (e.g. index 0 → id 226 → rotation/BMS-hall bits at
  `ParaPage.cs:891-895`). `docs/protocol.md` §4.1's `encode_read` is therefore **constructed,
  not observed**: it applies the documented `WriteAddr` algorithm with `len=0` (a valid input
  to the function signature, just never exercised by any call site) — flagged explicitly in
  the doc. Secondary cross-check (Worthless, quick look only — full cross-check is Task 6):
  `worthless/jadx/sources/com/rcplusplus/fdandroid/protocol/NativeProtocol.java:60` declares
  `native byte[] fdBuildReadPacket(int)`, a separate single-int-argument builder from
  `fdBuildWritePacket(int, byte[])` at line 64 — corroborating that Worthless also models
  "read a register" as an addr-only operation distinct from "write" (addr+payload), matching
  the `encode_read(addr)`/`encode_write(addr, value)` shape chosen here, even though
  Worthless's actual byte layout lives in the undecompilable native library.
- **Unlock trigger** (correcting an earlier draft of this note, which said the pass frame is
  sent "once per connection" unconditionally): `logincount` defaults to `1`
  (`ConnectPage.cs:307`), so the `logincount<1` gate at `ConnectPage.cs:3795` starts closed.
  It is reset to `0` — and only then, on the app's next periodic "maintain" tick
  (`ConnectPage.cs:3795-3799`) — by receiving the `cmd=0x7C` RX frame described above
  (`ConnectPage.cs:6357`). So the real order is: controller sends `0x7C` with its serial
  first → app's maintain tick sees the open gate → app sends `SendRs232DataPass`. The `id`
  the pass frame carries is `Convert.ToUInt32(App.clientid)` — a value the app already holds
  from a separate MQTT-based pairing/bind flow (`App.clientid = s3.Substring(0, 7)`,
  `ConnectPage.cs:1099`) — **not** parsed out of the `0x7C` frame's serial bytes; the code
  never asserts the two match.
- **Unlock / password — `SendRs232DataPass`** (`ConnectPage.cs:3972`, gated as above, with
  `id = Convert.ToUInt32(App.clientid)` — the bound-controller's client id): XORs two 32-bit
  halves of the fixed ASCII key `"D'1qF83x"` against `id*55571701+55571699`, packs the 8
  result bytes into a 16-byte frame with `cmd=0x7F` (127) and `addr`-position bytes 2-5 set to
  the little-endian `id`, and checksums it with a **different, simpler algorithm**: a plain
  16-bit additive sum over bytes 0-13, stored **low byte first** at offset 14 (`(byte)num6`)
  then high byte at offset 15 (`(byte)(num6>>8)`) — `ConnectPage.cs:4018-4024` — the opposite
  byte order from the CRC16 used by `WriteAddr`/`SetReadValue`, and not a CRC at all. This is
  *not* implemented in `fardriver_frame.py` (out of scope for the shared `checksum()`
  function; documented in `docs/protocol.md` §4.3 as its own algorithm).
- **`CMD5.cs` is dead code in this app.** `grep -rn CMD5 MotorNet6/MotorNet6/*.cs` (excluding
  `CMD5.cs` itself) returns nothing — no other file instantiates `CMD5` or calls
  `hexstr_to_md5`/`Add`. It is not the unlock mechanism; `SendRs232DataPass` is.
- **Legacy unlock — `App.CacuDiscover`** (`App.cs:500`, called from `ConnectPage.cs:3791`
  only for `!App.NewVersion` controllers): derives a 21-element `Discover[]` array from a
  per-device `discover` seed and the controller's serial number (`rcv_serialNumberfoc`) via a
  chain of per-byte linear-congruential-style transforms (`Discover[n] = (Discover[n-1] +
  K1) * K2 + K3 + serial[n]`, distinct magic constants per index). Not reverse-engineered
  further for this task — the serial-number input isn't observable statically, so no example
  bytes are derivable without a live device. Flagged as an open item, not blocking, since the
  primary (`NewVersion`) unlock path is fully documented above.
- **Legacy 8-byte frame — `SendRs232Data`** (`ConnectPage.cs:3947`, `ParaPage.cs:2305`, and
  duplicated in the other page classes): `[0xAA, mcmd, ~mcmd, scmd, va1, va2, sum, ~sum]`
  where `sum = mcmd+~mcmd+scmd+va1+va2+0xAA` truncated to a byte — a third, even simpler
  checksum (additive sum then one's-complement, no CRC table at all), used for the pre-CRC16
  "old" command protocol (`mcmd`/`scmd` opcodes, not register addresses). Noted in
  `docs/protocol.md` §4.4, not implemented in `fardriver_frame.py` (out of scope: it has no
  register `addr`, so it doesn't fit the `encode_read`/`encode_write`/`decode` interface).

### Official → register table (Task 5 findings)

**Where the table lives.** There is no single parameter-definitions table/array/JSON blob in
the app (the `Jurassic`/`ScriptEngine` search came back empty — the app does not evaluate JS
for parameters, and the APK has no loose `.js`/parameter `.json`). Instead, every writable
parameter is defined implicitly, twice, per UI page:

1. **Write side** — each field's `*_Clicked`/`*_TextChanged`/`*_SelectedIndexChanged` handler
   calls `WriteAddr(data, addr, len)` (§2 TX in `docs/protocol.md`) with a literal `addr` byte
   and a byte-packed payload built from the parsed UI value (scale/offset visible in the
   arithmetic right before the call). `ParaPage.cs` has ~50 such handlers (the basic/consumer
   page); `ProControlPage.cs` — a much larger "Pro" tuning page reachable from `ParaPage`'s
   `ButtonMode_Clicked` — has 211 `WriteAddr` call sites covering essentially every register
   `ParaPage` exposes plus ~80 more Pro-only ones. `ProBmsPage.cs` has zero `WriteAddr` calls
   (BMS parameters are read/displayed only, not written by this app) and `CurvePage.cs` has
   one (`addr=160`, a save/reset command already covered from `ParaPage`).
2. **Read side** — `ParaPage.cs`'s `"ReadParaMeter"` subscriber (`ParaPage.cs:857-1291`,
   registered via `MessagingCenter.Subscribe`) demultiplexes incoming RX family-1 frames
   (`docs/protocol.md` §2) by `int num = arg[1] & 0x7F` (0-54), maps `num` through
   `FlashReadAddr[55]` (`ParaPage.cs:177-184`) to a logical id `num2`, then a `switch(num2)`
   unpacks up to 6 little-endian `uint16` words per frame into `App.gflash[]` plus a handful of
   named `rcv_*`/`cfg*l`/`cfg*h` fields the page displays. Where a `cfg*`/`rcv_*` field set on
   the read side is later reused unmodified as part of a `WriteAddr` payload elsewhere in the
   same class (e.g. `cfg11l`/`cfg11h` for addr 11, `rcv_RelayDelay` for addr 33), that's the
   confirmation that the read and write sides address the *same* controller register — that's
   how `rx_frame`/`rx_offset` were derived for the ~27 entries that have them. `rx_frame =
   0x80 | index_of(num2 in FlashReadAddr)`; `rx_offset` = the payload-relative byte offset
   (`arg[N] - 2`, since payload occupies frame bytes 2-13).

**Extraction method.** No throwaway script was needed for the write side — a `grep -n
'WriteAddr('` per file gave every call site, then each was read directly (clean-room: the
JSON entries describe behavior in English/scale/enum form, they don't paste C#) to recover
`addr`, byte width, scale/offset arithmetic, and the `DisplayActionSheet`/`Substring` enum
option lists (Chinese + English pairs are both shown by the app depending on `App.CN`, which
is where the `notes` Chinese labels come from). A one-off Python helper in the session
scratchpad (`extract_writeaddr.py`, not committed) matched each `WriteAddr(...)` call to its
enclosing method name via a "last `private/public/...` signature before this line" scan, to
get a fast addr→method-name→line-number index across `ProControlPage.cs`'s 211 call sites
before reading the surrounding code by hand; the JSON's `explain`/`scale`/`min`/`max` values
all come from reading the actual C# arithmetic, not from the script's output.

**Shape of the table.** 110 unique register addresses ended up in `protocol/registers.json`
(`uv run --project tools/registers tools/registers/validate.py` → `OK`). Several UI fields
share one `addr` because the controller packs multiple booleans/enums into one 16-bit word
(e.g. `addr 33` is a single "output relay / feature enable" bitfield that 22 different
checkboxes across `ParaPage`/`ProControlPage` all read-modify-write; `addr 105/106/107` each
pack four 4-bit pin-selector nibbles; `addr 136-155` are a 20-point power-limit/regen curve
vs. motor RPM, two points per register). Each of those became **one** JSON entry (schema
requires unique `addr`) with the sub-fields described in `explain`/`notes` rather than split
across multiple entries — a real bit-level breakdown belongs in a later task if/when needed.

**Excluded on purpose:**
- `addr 3`, written by `SetVerify()`/`OnButtonResetClicked` case 9 (`ProControlPage.cs:13879`,
  `len=102`) — a 102-byte "write key"/license-verification blob, not a scalar/bitfield
  register; doesn't fit the schema's `type` enum and isn't a tunable parameter.
- `App.gflash[]`/`App.gcflash[]` words that are populated by `ReadParaMeter` but never
  targeted by any `WriteAddr` call anywhere in `MotorNet6/*.cs` (e.g. rated power at logical
  id 18/offset8, `App.gflash[62..]` in later pages) — these are read-only telemetry-shaped
  values with no write `addr`, so they don't fit this schema (`addr` is required) and belong
  in `protocol/telemetry.json` if a later task wants them, not `registers.json`.
- The RX family-2 (`cmd` top-bit clear) alternate decode inside `ParaPage.cs`'s
  `ReadParaMeter` (`ParaPage.cs:1294-1339+`, `switch(arg[1])` at `ParaPage.cs:1339` on raw
  small values 0/8/9/10/…,
  guarded by the frame's own additive checksum) appears to be a second, older/parallel
  decoding of the same register space for pre-"NewVersion" controllers. It duplicates several
  named fields already captured from the primary path (e.g. `rcv_RatedVoltage`,
  `rcv_MaxLineCurr`) with different byte offsets. Not reconciled against `docs/protocol.md`
  §2's two-family description in this task — flagged here as a possible undocumented third RX
  shape variant worth a closer look in a future protocol task; it does not change any
  `registers.json` entry.

**Confidence.** Every entry is `"confidence": "low"` per the brief. Scale/unit/min/max are
read directly from the decompiled arithmetic and UI validation bounds where present (e.g.
`LmtSpeed_TextChanged`'s explicit `128 <= num <= 12000` check), but the *physical* effect of
many Pro-only tuning fields (current-loop gains at addr 15/16/17, `LD`/`LQ` inductance at
18/27, several one-wire-dashboard-protocol registers at 180-188/208/213) is only as good as
the English UI label translated from Chinese/short variable names — those all end their
`explain` with "(effect unverified)" per the brief's rule. Two pairs of Pro-page field
labels/variable names look swapped or reused inconsistently in the decompiled source itself
(`MaxKI_TextChanged` writes what the UI prompts as `MaxKI` but reads back `rcv_StartKP`;
`StartKC_TextChanged`/`MaxKI_TextChanged` both target `addr 16`) — called out explicitly in
those two entries' `explain` text rather than silently picking one label.

**Schema change.** `protocol/schema/register.schema.json` gained two optional fields,
`rx_frame` (`^0x[0-9A-F]{2}$`, the RX `cmd` byte `0x80|index`) and `rx_offset` (integer ≥ 0,
byte offset within the 12-byte RX payload), both outside `required` so existing/future
entries without a known read path stay valid; `additionalProperties: false` kept.
`tools/registers/tests/test_validate.py` gained `test_rx_frame_and_offset_pass` (both fields
present validates) and `test_bad_rx_frame_pattern_fails` (a malformed `rx_frame` like `0x1`
is rejected).

## Worthless Controls (KMP, R8-obfuscated)

- `reference/decompiled/worthless/jadx/` — `jadx --deobf --threads-count 8` against
  `worthless.apk` (single `classes.dex`, ~12MB). Took a few minutes; finished with
  `ERROR - finished with errors, count: 227` — jadx couldn't fully decompile 227 of 4304
  top-level classes (typical for R8-obfuscated/inlined Kotlin bytecode; check `.java` files
  under `sources/` for `/* JADX ERROR */` comments if a specific class looks empty). This
  did not block the overall run and all 6727 `.java` files under `sources/` were still
  produced.
- App code: unlike the brief's assumption that FarDriver-specific code sits under the fully
  obfuscated `a/`-style packages, jadx's `--deobf` renamed the single-letter obfuscated
  root package to `reference/decompiled/worthless/jadx/sources/p000a/` (5634 files, classes
  named like `a02.java`, `a30.java` — mostly third-party/library code pulled in by R8).
  The FarDriver-specific app code kept its real package name and is readable directly at
  `reference/decompiled/worthless/jadx/sources/com/rcplusplus/fdandroid/`:
  - `protocol/NativeProtocol.java` — looks like the JNI/native bridge for the BLE protocol,
    start here.
  - `data/FardriverConfig.java`, `FardriverTelemetry.java`, `FaultEntry.java`,
    `BmsStatus.java`, `BmsTelemetry.java`, `KnownController.java`, `SavedDevice.java`,
    `Motor` — kotlinx.serialization data classes (each has a `$$serializer` companion);
    these are the clearest source of field names/types for the wire protocol and for the
    `motors.json`/`sotion_params.json` config files.
  - `ble/ConnectionService.java`, `ShareMessage.java`, `SharePayload.java` — BLE transport.
  - `wear/WearCommandService.java`, `MainActivity.java`, `FDApplication.java`.
  - There is also a nearly-empty `worthless/control/R.java` (just the generated resource
    class for the `worthless.control` package — not app logic).
- Resources: `reference/decompiled/worthless/jadx/resources/` — Compose Multiplatform
  resources under `assets/composeResources/fd_android.shared.generated.resources/`, as
  expected.
- Strings: `reference/decompiled/worthless/strings/<locale>.json`, decoded from the
  `.cvr` files under `assets/composeResources/.../values*/strings.commonMain.cvr` via
  `tools/cvr2json.py`. `values.json` (default/English) has **1333** strings; other locales
  (`es`, `fr`, `ko`, `pt-rBR`, `ru`, `th`, `tr`, `zh`) have ~1329-1331.
  - **Format deviation from the brief:** each `.cvr` file has a `version:0` header line
    before the `type|key|base64` lines, not just `type|key|base64` lines. `cvr2json.py`
    was adjusted to skip a first line starting with `version:` before parsing the rest as
    `type|key|base64`. Confirmed with `head -5` on
    `values/strings.commonMain.cvr`:
    ```
    version:0
    string|acceleration|QWNjZWxlcmF0aW9u
    string|allow|QWxsb3c=
    string|app_name|V29ydGhsZXNzIENvbnRyb2xz
    string|apply|QXBwbHk=
    ```
- Data files: `reference/decompiled/worthless/files/{motors.json,sotion_params.json,racedash.html}`
  copied out of the Compose resources `files/` subdirectory, as expected. `motors.json` is
  ~660KB, `sotion_params.json` ~73KB — likely motor/parameter definition tables worth
  cross-referencing against `data/Motor.java` and `data/SotionParamField.java`/
  `SotionParamGroup.java`.
- English config split: `reference/decompiled/worthless/jadx-en/` decompiled from
  `worthless-en.apk` (small resource-only config APK; jadx finished cleanly, no errors).

## GDriver (Hermes)

- `reference/decompiled/gdriver/index.android.bundle` — extracted from `gdriver.apk`
  (`assets/index.android.bundle`). Confirmed Hermes magic `c6 1f bc 03`.
- `reference/decompiled/gdriver/decompiled.js` — **hbc-decompiler succeeded** (exit 0),
  contrary to the brief's "fallback is acceptable" caveat. 86MB / ~1.76M lines. The tool
  logged:
  ```
  WARNING:root:Bytecode version 98 corresponds to a development or recent version of the
  Hermes bytecode and is not formally supported by the current tool.
  ```
  plus many `pass4: LoadFromEnvironment/StoreToEnvironment references unknown register N`
  warnings (closure-variable resolution artifacts from the unsupported bytecode version),
  but it still produced a complete, readable decompile: control flow is emitted as a
  register-based `switch`/goto state machine (not clean structured JS), but string
  literals, object/property names, and original function names (as `// Original name: ...`
  comments) are preserved. Bytecode version: **98**.
- `reference/decompiled/gdriver/disasm.txt` — `hbc-disassembler` output, also succeeded
  (135MB), kept as a fallback/cross-reference per the brief even though the decompiler
  itself worked.
- `reference/decompiled/gdriver/strings.txt` — `strings -n 6` over the raw bundle (8718
  lines). Grepping it for protocol-ish terms turns up `CONTROLLER`,
  `controllerpersistence`, `controllerreconnect`, `existingcontrollerlookup`,
  `fardriver.fault.` as good starting search terms in `decompiled.js`.
- `reference/decompiled/gdriver/jadx-en/` — jadx output for `gdriver-en.apk` (English
  resource config APK), finished cleanly.
- GDriver is a React Native (Hermes/JS) app, so unlike the other two apps there's no
  separate "native app code" package to point at — everything (including BLE/protocol
  logic) lives in the single `decompiled.js`/`disasm.txt`, mixed in with React Native,
  Reanimated, and other bundled JS libraries. Searching `decompiled.js` for the terms above
  is the way in.
