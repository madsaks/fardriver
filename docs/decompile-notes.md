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
