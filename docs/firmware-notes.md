# Firmware download — findings from the official 288 app

Static analysis only — no network request was made against any FarDriver server for this task.
The 2026-10-24 [native follow-up](native-protocol.md) adds offline AArch64 execution
of Worthless's conditioning and sync routines; it does not contact a server or controller.
Cite format matches `docs/protocol.md`: `<app>:<path under reference/decompiled/><#Lline>`. The
BLE-side bootloader/chunk-transfer protocol (what happens *after* the phone already has a
firmware file on local storage) is documented in `docs/protocol.md` §7, not repeated here.

## Update check

- **Transport: MQTT**, not HTTP. The app bundles `MQTTnet`
  (official:official/src/MotorNet6/MotorNet6.csproj#L147-L148) and uses it for the entire
  filelist/download exchange — `System.Net.Http`/`HttpClient`/`RestClient` are never used
  anywhere in `MotorNet6/*.cs` for anything firmware-related (the only literal `http://` URLs
  found anywhere in the app are Xamarin XAML namespace URIs, an AMap JS SDK URL, and UI icon
  images at `http://182.92.233.85:6868/image/*.ico`
  (official:official/src/MotorNet6/MotorNet6.MonthRecordPage.xaml#L46-L52,
  official:official/src/MotorNet6/MotorNet6/MapPage.cs#L55) — unrelated to firmware).
- **Broker/endpoint**: `iot.fardriver.com:1883` (primary — `App.monitoraddr`,
  official:official/src/MotorNet6/MotorNet6/App.cs#L124) or `182.92.233.85:1884` (backup —
  `App.backupaddr`, official:official/src/MotorNet6/MotorNet6/App.cs#L126), selected by a
  `backuplink` flag (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1489-L1508).
  MQTT protocol version 3.1.1, plain TCP — **no TLS**: no `WithTls`/`UseTls`/
  `SslProtocol`/`AllowUntrustedCertificates` call exists anywhere in `MotorNet6/*.cs`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1491-L1509 shows the full
  `MqttClientOptionsBuilder` chain with no TLS step). `182.92.233.85` is the same host that
  serves the plaintext-HTTP UI icon images above, on a different port.
- **Request (file list)**: the app publishes to the fixed topic `000000000000000/bind/filelist`
  with payload = `App.clientid` (the 7-character bound-controller client id obtained from a
  separate pairing/bind flow, `docs/decompile-notes.md`'s Task 4 notes) —
  official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4085,#L4133,#L5992,#L6571. The
  response is delivered to `OnMqttReceived` on some topic whose name **contains** the substring
  `/filelist` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1001) — the exact full
  topic template used by the server is not visible from the client side, only this substring
  match. Payload is UTF-8 text: a `/`-delimited list of filenames, split directly into
  `App.RemoteFileNames` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1003-L1012).
- **Request (binary)**: after the user picks a file in `FilePage`, the app publishes to the
  fixed topic `000000000000000/bind/download` with payload = the bare filename string (e.g.
  `HB1234.bin`), taken from `App.fileName` with any path prefix stripped
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3000). The response arrives on a
  topic that **contains both** `/download` and that same filename
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1058-L1060) — again only a
  substring match is visible client-side, not a full topic template.
- **Auth/signing**: the MQTT `CONNECT` itself is authenticated with `App.username` (the
  FarDriver account login, not a device-specific secret) and a password built as
  `Encrypt(App.password + "_ts_" + timestamp + "_fu_" + <flow marker><code>)`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1479-L1508) — `Encrypt()` RSA-encrypts
  (PKCS#1 v1.5, `DoOAEPPadding: false`) the UTF-16 plaintext against an **embedded RSA public
  key literal** in the app
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L112,#L385-L399) — so the server
  holds the matching private key and this is a real (if app-embedded-key) asymmetric scheme, not
  a static shared secret. The same `Encrypt()`/RSA-public-key mechanism is reused for a handful
  of other sensitive MQTT payloads (remote-help pairing requests, forced-unbind requests,
  `official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L503-L504,#L638-L639`) — but **not**
  for the firmware filelist/download payloads themselves, which travel as plain UTF-8 text
  (filelist) or raw bytes (download) with no encryption or signing step visible in
  `OnMqttReceived`'s handling of either topic. Contrast: the separate `/bind/message` topic *does*
  XOR its payload against a fixed 16-byte key array `bk[]` before writing it to disk
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L679-L691) — no equivalent transform
  exists on the `/filelist` or `/download` handlers, so whatever protection those two topics have
  is either none (client-visible) or handled entirely server/broker-side (not observable here).
- **Response shape**: filelist = plain `/`-separated filename list, no envelope. Download = the
  raw binary file content as the entire MQTT payload, written straight to disk with
  `File.WriteAllBytes(App.fileName, arg.ApplicationMessage.PayloadSegment.Array)`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1058-L1071) — no JSON/XML wrapper,
  no length-prefix, no checksum field observed at the MQTT-message level (the firmware image's
  *own* internal CRC32 table, used once it reaches the BLE bootloader stage, is a separate
  mechanism documented in `docs/protocol.md` §7).
- **Open item — subscription mechanism is not statically explained.** A `MqttSub()` wrapper
  exists and calls `mqttClient.SubscribeAsync(...)`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1518-L1527), but **it is never
  called anywhere** in `MotorNet6/*.cs` (confirmed: `grep -n 'MqttSub(' *.cs` only matches its
  own declaration). Yet `OnMqttReceived` clearly does fire for `/filelist`, `/download`, `/bind`,
  etc. — so either the broker delivers messages to this client without an explicit `SUBSCRIBE`
  packet (e.g. an ACL/bridge rule keyed to the connecting username/client id), or a subscription
  happens somewhere this search didn't find. Not resolved statically; flagged for phase 3.

## Binary

- **URL pattern: none.** There is no HTTP(S) URL construct anywhere in the firmware download
  path — delivery is entirely MQTT publish/subscribe, keyed by filename string rather than by
  any URL (see Update check above). The only firmware-adjacent literal host/port pair is the
  MQTT broker itself (`iot.fardriver.com:1883` / `182.92.233.85:1884`), not a REST/download URL.
- **Filename convention**: a 1-2 letter prefix that encodes hardware family, paired against
  `App.HardVer` (a single ASCII letter read back from the controller — see "Version
  registers/fields" below) to filter the file list per device
  (official:official/src/MotorNet6/MotorNet6/FilePage.cs#L348-L459): `H0`-`Z9` or `I0`-`J9` /
  `M0`-`N9` / `O0`-`P9` / `Q0`-`R9` / `S0`-`T9` / `U0`-`V9` / `X0`-`Y9` for `.heb`-family
  controllers keyed by `App.HardVer`; a two-uppercase-letter + `A`-suffix-third-char pattern
  ending `.hex` for `HardVer` `G`/`A`; a similar pattern ending `.bin` with a `B`-suffix third
  char for `HardVer` `B`; and a `BN485` substring match for RS-485 dashboard firmware
  (official:official/src/MotorNet6/MotorNet6/FilePage.cs#L460-L468). Files whose name starts
  with `ISOLATE_` or `CG56_` select an alternate `WriteSysCmd` mode-select byte immediately
  before flashing (`docs/protocol.md` §7's "Entering bootloader"), and `BMS`-containing names
  select the BMS-specific CRC/size branch of `FlashHex()` (`docs/protocol.md` §7's
  "Verification").
- **Three file formats**, disambiguated by extension in `FlashHex()`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4424-L4920):
  - `.bin` — a raw binary controller/BMS image; per-block CRC-32 checksums are **already
    embedded** in the file at a fixed offset (read out, not computed —
    official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4550-L4599).
  - `.hex` — Intel HEX ASCII records (`:LLAAAATT<data><checksum>\r\n`), parsed line-by-line with
    a simple additive record checksum
    (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4670-L4680); the per-block
    CRC-32 table is **computed by the app itself** after reassembly, not read from the file
    (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4684-L4719).
  - `.heb` — a distinct, much smaller (696-byte) **parameter-only** container (312-byte
    `wflash` + 384-byte `cflash` region), handled by `Readfile()`
    (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1979-L2004), not a firmware image
    at all and not part of the BLE bootloader path in `docs/protocol.md` §7.
- **Encrypted at rest / in transit?** Not observed to be encrypted by anything this client does:
  the MQTT payload is written straight to disk with no decrypt step (see Update check above),
  and the MQTT transport itself is plain TCP with no TLS. Whether the **server** encrypts,
  signs, or otherwise protects the binary before/after this exchange is not visible from the
  client and cannot be determined by static analysis of this app alone. Worthless Controls'
  parallel firmware loader (`worthless:jadx/sources/p000a/w31.java#L454-L489`, cross-checked in
  `docs/protocol.md` §7) conditionally calls a **native**, undecompilable
  `fdFwCondition(byte[], int)` transform
  (`worthless:jadx/sources/com/rcplusplus/fdandroid/protocol/NativeProtocol.java#L66`) on the
  firmware bytes, gated by a nonzero mode flag, specifically in the largest (>128KB) file-size
  branch (`worthless:jadx/sources/p000a/w31.java#L461-L467`) — this is suggestive of some
  images requiring a native conditioning/decryption step before flashing, but the transform's
  actual effect is opaque and not confirmed either way. Two further Worthless native functions,
  `fdGenerateDrmKey(int)` and `fdGetDrmStatus(int)`
  (`worthless:jadx/sources/com/rcplusplus/fdandroid/protocol/NativeProtocol.java#L70,#L76`), have
  no Java-level caller anywhere in `worthless:jadx/sources/` (confirmed by grep) and no
  equivalent in the official app at all — their existence hints at some DRM/licensing concept
  around firmware in Worthless's supported-brand feature set, but nothing about how or when they
  are used is statically visible.
- **Format**: raw binary (`.bin`) or Intel HEX text (`.hex`) firmware images; `.heb` is a
  separate small parameter blob, not a firmware container (see above).

## Version registers/fields

No register `addr` (in the `WriteAddr`/§4-5 sense) carries model/hardware/firmware version —
confirmed by (a) no `WriteAddr` call site anywhere in `MotorNet6/*.cs` targets an address
holding these fields, and (b) Task 6's cross-check already found the matching Worthless
`FardriverConfig` fields (`kzqVersion0`, `kzqVersion1`, `softVer`) have **no literal register
address anywhere in Worthless's Java either**
(`docs/decompile-notes.md`'s Task 6 "Unaddressable Worthless-only fields" list) — independent
confirmation from both apps that these are not `addr`-based registers. They *are*, however,
observable as extra bytes piggybacked on the id-130 **telemetry** frame (`cmd=0x99`,
`docs/protocol.md` §6's "Frame 0x99 — id 130" table, previously documented only for
`throttle_voltage` at payload offset 0-1):

- payload offset 9 (`arg[11]`): `App.HardVer` — a single ASCII hardware-version-family letter
  (official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L1113-L1124, corroborated
  independently by official:official/src/MotorNet6/MotorNet6/GraphPage.cs#L1974-L1984 reading
  the same byte into its own local `rcv_kzqVersion0`).
- payload offset 10 (`arg[12]`): `App.SoftVer0` — a single ASCII software-version-family
  character (official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L1121,#L1124).
- payload offset 11 (`arg[13]`): `App.Softver1` — a raw numeric software sub-version byte (not
  cast to `char`, unlike the two above — official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L1122,#L1125).

Because these have a known `rx_frame`/`rx_offset` but no `addr`, they don't fit
`protocol/registers.json`'s schema (`addr` is required); they have been added to
`protocol/telemetry.json` instead (group `misc`), consistent with how this project has already
treated every other addr-less read-only field (`docs/decompile-notes.md`'s Task 5/7 exclusion
notes for `App.gflash[]` echoes and `status_word_4`). `App.ModelName` (a composite string built
client-side from several other registers/telemetry values plus the parsed BLE-advertised
serial, official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L1582-L1654) and `App.ver` (the
*phone app's own* version via `VersionTracking.CurrentVersion`,
official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L2251) are not controller register or
telemetry values at all and are not added anywhere.

## Open questions for phase 3

- **Subscription mechanism**: how does the app receive `/filelist`/`/download`/`/bind` messages
  with no observable `SubscribeAsync`/`MqttSub()` call site anywhere in `MotorNet6/*.cs`? A
  live MQTT capture (or a decompile of the server/broker config) is needed to resolve this.
- **Exact response topic templates** for `/filelist` and `/download` — only substring-match
  conditions were found client-side (`Contains("/filelist")`, `Contains("/download")` +
  filename), not a full topic string the client constructs or subscribes to.
- **Server-side protection of the binary**: nothing in this client tells us whether the broker
  or backend encrypts, signs, or access-controls the firmware payload before it reaches the
  `/download` exchange described above; this task made no network request, per its scope, so
  this remains unverified either way.
- **Worthless native conditioning: resolved in the 2026-10-24 follow-up.**
  `fdFwCondition` copies the image and optionally XORs the first 202 words of pages 5–103
  using a deterministic per-page/word state sequence. The exact transformation and four
  sync packets were recovered and emulated; see [native-protocol.md](native-protocol.md).
  `fdGenerateDrmKey`/`fdGetDrmStatus` were statically inventoried as session/product-state
  surfaces; controller acceptance and authorization semantics remain unverified.
- **GDriver was not checked** for a firmware download source — per this task's brief, GDriver
  recon was scoped to "only if the other two [official app, Worthless] leave the download source
  unknown," and the official app's MQTT-based mechanism above is fully identified, so this
  wasn't pursued. If a future task needs GDriver's own download path (it may differ, being an
  independent React Native app rather than a FarDriver-family client), start from
  `reference/decompiled/gdriver/strings.txt`/`decompiled.js` grepping for `firmware|ota|\.bin|https?://`
  per the brief's fallback guidance.
- **Legacy (`!App.NewVersion`) flash path** (`OnFlashClicked`/func=1) reuses the same
  `DownloadFunction()`/`SendDataPacket()` state machine as the primary update path
  (`docs/protocol.md` §7) but was not traced separately for every `App.date` family variant
  (only the `32303` shape was read in full detail); a future task targeting a specific older
  hardware family's flash layout should re-derive its exact block size/count from
  `official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L5183-L5637` rather than assuming it
  matches the `32303` family documented here.
