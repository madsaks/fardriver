# FarDriver BLE protocol

Derived from decompiling the official 南京远驱 288 app (primary) and Worthless
Controls 5.1.16 (secondary). Every claim cites its source as
`<app>:<path under reference/decompiled/><#Lline>`. Byte examples in this
file are executed as tests by `tools/protocol/tests/test_frame.py`.

Full file:line finding notes (including the search trail) live in
`docs/decompile-notes.md` under "Official → BLE (Task 4 findings)".

## 1. BLE transport

- **Advertised name pattern**: the scan filter accepts device names (uppercased) containing
  `"YUANQU"`, `"CONTROL"`, or `"BMS"` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1639).
  VCU controllers specifically advertise as `YUANQU0<7-digit serial>` — the app extracts the
  serial with `Name.Substring(6, 7)` whenever the name contains `"YUANQU"`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L2842-L2849), and matches
  `"YUANQU0"` specifically to reconnect to the last-used device
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1668). 远驱 ("Yuanqu") is the
  manufacturer's name in pinyin.
- **Service UUID**: `0000FFE0-0000-1000-8000-00805F9B34FB`. Declared as
  `commHeadUUID = new Guid(65504, 0, 4096, new byte[8]{128,0,0,128,95,155,52,251})`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L96) — `65504 == 0xFFE0`, and the
  trailing bytes are the standard Bluetooth SIG base UUID, so this is the 16-bit assigned
  UUID 0xFFE0. Selected during service discovery by matching `Guid.ToByteArray()[0]==0xE0`
  and `[1]==0xFF` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6113-L6122).
- **Write characteristic**: `0000FFEC-0000-1000-8000-00805F9B34FB` (same base UUID pattern;
  `commUUID = new Guid(65516, ...)`, `65516 == 0xFFEC`,
  official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L94), selected by matching
  `Guid.ToByteArray()[0]==0xEC`, `[1]==0xFF`
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6131-L6134). Write type: **not
  set explicitly anywhere** in `MotorNet6/*.cs` — no call to set `WriteType` on the
  characteristic was found, so the app takes whatever default Plugin.BLE assigns for that
  characteristic's advertised GATT properties (with-response vs. without-response is not an
  app-level decision here).
- **Notify characteristic**: the **same** 0xFFEC characteristic — there is only one `chs`
  field, used for both `chs.WriteAsync(...)` and `chs.ValueUpdated += ...` /
  `chs.StartUpdatesAsync()` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6144,#L6154).
  FarDriver does not use a separate read/notify characteristic — write and notify share
  0xFFEC on service 0xFFE0.
- **MTU / max write size**: no MTU negotiation call (`RequestMtuAsync`/`MtuSize`) exists
  anywhere in `MotorNet6/*.cs`. Consistent with the default (un-negotiated) ATT MTU of 23
  bytes, the large-payload path of the frame builder manually splits data into 20-byte
  `chs.WriteAsync` sub-packets with a 10ms delay between each
  (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4372,#L4395, guarded by the
  `len==388`/`len==316` special cases at #L4339,#L4342 — those are large firmware/parameter
  block transfers, not ordinary register reads/writes, and are out of scope for this task's
  codec).
- **Connect sequence** (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1655-L1690,
  #L6108-L6154):
  1. Scan, filter by name (see above), `adapter.ConnectToDeviceAsync(device)`.
  2. On `DeviceState.Connected`, call `OnDeviceStateChanged()`, which does
     `bluedevice.GetServicesAsync()` → find service 0xFFE0 → `GetCharacteristicsAsync()` →
     find characteristic 0xFFEC.
  3. Attach a `ValueUpdated` handler, then `chs.StartUpdatesAsync()` to subscribe to notifies.
  4. No explicit "hello"/handshake write is sent at this point. Once subscribed, the
     controller begins streaming unsolicited 16-byte telemetry/parameter frames (§2, §4.1).
  5. The controller announces itself with a `cmd=0x7C` serial-number frame (§2's second RX
     family, §4.4) — `official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6350-L6357`.
     Receiving it stores the serial in `App.rcv_serialNumber` and resets `logincount = 0`
     (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6356-L6357;
     `logincount` otherwise defaults to `1`,
     official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L307, so the gate below is
     closed until this frame arrives). The app does not react immediately; on its next
     periodic "maintain" tick it checks `logincount<1`
     (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3795-L3799) and, if true,
     sends the password/unlock frame described in §4.3, using `id =
     Convert.ToUInt32(App.clientid)` — the app's own bound-controller client id, set earlier
     via a separate pairing/bind flow (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L1099),
     **not** a value parsed out of this 0x7C frame. So the real order is **controller
     announces its serial (unblocking the gate) → app sends its independently-bound
     `clientid` as the unlock frame's `id` on the next tick**, not "the app unlocks
     unconditionally once per connection with no controller-side trigger" as an earlier draft
     of this doc said.

## 2. Frame format

FarDriver has three frame shapes over the same 0xFFEC characteristic — one TX shape and two
RX shapes — each protected by one of §3's checksum algorithms. Multi-byte values are
**little-endian** (low byte first) — e.g. the 2-byte
register payload is written as `data[4]=(byte)value; data[5]=(byte)(value>>8);`
(official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2410-L2413), and RX telemetry words
are decoded the same way, e.g. `App.rotation = (ushort)(arg[9]*256 + arg[8])`
(official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L895). The checksum's own two bytes
are the one exception — see §3 for their fixed placement order.

### TX — register write (and the constructed register read, §4.1)

Built by `WriteAddr` (official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2319-L2334,
identical algorithm in official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4329-L4359).
Header is `0xAA`. Total frame length is **variable**: `6 + payload_len` bytes (not the fixed
16 used by RX frames below).

| Offset | Size | Meaning |
|---|---|---|
| 0 | 1 | Header, always `0xAA` |
| 1 | 1 | `cmd = 0xC0 \| (payload_len + 4)` — top 2 bits fixed `11`, low 6 bits encode `payload_len + 4` (the count of header+cmd+addr+addr bytes plus the payload) |
| 2 | 1 | Register address (`addr`) |
| 3 | 1 | Register address, duplicated (`data[2]==data[3]==addr`, both set to the same value by `WriteAddr`) |
| 4 | `payload_len` | Payload (register value), little-endian |
| 4+payload_len | 2 | Checksum over bytes `0..3+payload_len` (see §3) |

### RX — two frame families, both 16 bytes fixed

Both are parsed by the same `SetReadValue`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6162-L6364), which dispatches on
byte 1's top bit as soon as it has 2 bytes of a new frame
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6187,
`(m_Received[1] & 0x80) == 128`). **Both `decode()` and `SetReadValue` are RX-only** — they
decode notify bytes coming *from* the controller; they are not the inverse of `encode_read`/
`encode_write`, which build the separate TX shape above. Header is `0xAA` for both; frame
length is **fixed at 16 bytes** for both.

#### RX family 1 — telemetry / parameter frame (cmd top bit set)

| Offset | Size | Meaning |
|---|---|---|
| 0 | 1 | Header, always `0xAA` (frame accumulation only starts once this byte is seen: official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6174) |
| 1 | 1 | `cmd`. Top bit `0x80` set selects this family (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6187). The low 7 bits are an index (0-127) that pages further map through their own `FlashReadAddr[55]` table (official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L177-L184) to a logical parameter id — that mapping is the register table, out of scope for this task (Task 5). **The index ranges over the full 0-127, including values whose cmd byte (0xC0-0xFF) looks like a TX command-frame cmd byte** — e.g. index 72 is `cmd=0xC8` — so a decoder must not try to distinguish this family from the TX shape by cmd's low bits; the top bit alone decides |
| 2-13 | 12 | Payload — 6 little-endian uint16 words in the telemetry-array case, indices 56-87 (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6211-L6222); page-specific field layouts otherwise (e.g. rotation at bytes 8-9, official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L895) |
| 14-15 | 2 | CRC16 checksum over bytes 0-13, §3's primary algorithm |

#### RX family 2 — download-ack / serial-trigger frame (cmd top bit clear)

A second, less common 16-byte frame, still parsed inline in `SetReadValue`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6272-L6360). Two cmd values are
actually produced by the controller in this codebase: `0x1F` (firmware/download
acknowledgements, official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6290-L6349) and
`0x7C` (the serial-number/login-trigger frame, §4.3,
official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6350-L6357).

| Offset | Size | Meaning |
|---|---|---|
| 0 | 1 | Header, always `0xAA` |
| 1 | 1 | `cmd`, top bit clear. `0x1F` = download ack (a sub-command in byte 2, duplicated at byte 3, official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6290); `0x7C` = serial-number frame |
| 2-13 | 12 | Family- and cmd-specific. For `cmd=0x7C`: bytes 2-5 are the controller's serial number as a little-endian uint32 (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6356); bytes 6-13 unused/zero in the observed case. For `cmd=0x1F`: byte 2 (== byte 3) is a download sub-command, bytes 4-11 are two little-endian uint32 values (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6299-L6306) |
| 14-15 | 2 | Additive-sum checksum over bytes 0-13, §3's second algorithm — **stored high byte first**, the opposite placement from RX family 1's CRC16 and from the TX unlock frame's own additive-sum checksum (§4.3, low byte first) |

`docs/decompile-notes.md` previously mis-described this as "a legacy 8-byte 'download' path,
not used for register I/O" — that was wrong on both counts: the frame is 16 bytes, not 8, and
it's the vehicle for the `0x7C` unlock-trigger frame, not merely a firmware-download
leftover. Corrected there too.

## 3. Checksum

FarDriver uses **three different 16-bit checksum algorithms** across the frames this doc
covers — they do not all share one scheme. This section covers the two that matter for §2's
frame shapes; §4.3 and §4.4 cover the other two (the unlock TX frame's own additive sum, and
the legacy `SendRs232Data` one's-complement sum) where they're used.

### 3.1 Primary: table-based CRC16

Used by both the TX command frames (`encode_read`/`encode_write`, §2 TX) and RX family 1
(the telemetry/parameter frame, §2 RX). Computed byte-by-byte with two 256-entry lookup
tables, `crctablelo`/`crctablehi`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L155,#L185 — duplicated verbatim in
`GraphPage.cs`, `CurvePage.cs`, `StatPage.cs`, `ParaPage.cs`, `ProControlPage.cs`). These
tables are byte-for-byte identical to the standard CRC-16/MODBUS lookup tables (verified by
cross-checking against a bitwise CRC-16/MODBUS reference implementation seeded with the
standard `0xFFFF` init: the table-driven and bitwise results agree once byte order is
accounted for). FarDriver's twist is a **non-standard initial register value**: `(0x3C,
0x7F)` instead of the standard `(0xFF, 0xFF)`.

The loop (identical in the RX verifier,
official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6196-L6204, and the TX generator,
official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2326-L2334):

```
b, b2 = 0x3C, 0x7F
for byte in covered_bytes:
    idx = b ^ byte
    b, b2 = b2 ^ crctablehi[idx], crctablelo[idx]
# the two output bytes are appended in this exact order: b, then b2
```

Python translation (`checksum()` in `tools/protocol/fardriver_frame.py`):

```python
def checksum(payload: bytes) -> int:
    b, b2 = 0x3C, 0x7F
    for byte in payload:
        idx = (b ^ byte) & 0xFF
        b, b2 = (b2 ^ _CRC_HI[idx]) & 0xFF, _CRC_LO[idx]
    return (b << 8) | b2
```

`checksum()`'s return value is defined as `(b_final << 8) | b2_final` — i.e. its two bytes,
written big-endian, are exactly the two bytes appended to the frame in the order the
decompiled loop produces them (`b` first, `b2` second). This is a definitional choice made
here for a clean Python API, not a claim about "CRC high/low byte" terminology in the
original algorithm.

- **Which bytes are covered**: every byte of the frame except the checksum's own trailing
  bytes — offset `0` through `N-3` for an `N`-byte frame.
- **Where the result is placed**: the final `b` byte at offset `N-2`, then the final `b2`
  byte at offset `N-1` (the frame's last two bytes).

### 3.2 RX family 2: additive sum, high byte first

Used only by RX family 2 (§2, `cmd` top bit clear — `0x1F` download acks and the `0x7C`
serial-number/login-trigger frame, §4.3/§4.4). No lookup table: a plain 16-bit sum of the 14
covered bytes (`ushort rcv_crc`, so the sum itself wraps mod 65536), then compared/stored
**high byte first**
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6282-L6287):

```csharp
rcv_crc = 0;
for (int j = 0; j < 14; j++) { rcv_crc += m_Received[j]; }
// valid iff m_Received[14] == rcv_crc >> 8 && m_Received[15] == (rcv_crc & 0xFF)
```

Python translation (`_rx_additive_checksum()` in `tools/protocol/fardriver_frame.py`):

```python
def _rx_additive_checksum(body: bytes) -> int:
    return sum(body) & 0xFFFF
```

Its 16-bit result, written big-endian (high byte, then low byte), is exactly the placement
`SetReadValue` checks — same *shape* as §3.1's `checksum()` return convention, but a
different, non-CRC value, and covering a different frame family. **Do not confuse this with
the unlock/password TX frame's own additive-sum checksum in §4.3, which is the same "plain
16-bit sum of bytes 0-13" idea but stored in the opposite byte order (low byte first, at
offset 14, then high byte at offset 15) — official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4018-L4024.**
Three algorithms, easy to conflate:

| Used by | Bytes covered | Placement |
|---|---|---|
| §2 TX frames, §2 RX family 1 (§3.1, `checksum()`) | 0..N-3 | table CRC16, result byte `b` then `b2` |
| §2 RX family 2 (§3.2, `_rx_additive_checksum()`) | 0..13 | plain sum, **high** byte then low byte |
| §4.3 unlock TX frame | 0..13 | plain sum, **low** byte then high byte |
| §4.4 legacy `SendRs232Data` 8-byte frame | 0..5 | sum then one's-complement (`sum`, `~sum`) |

## 4. Commands

### 4.1 Read register

**No explicit per-register read request exists in the official app.** Every `WriteAddr`/
`SendRs232Data` call site found in `MotorNet6/*.cs` is a *write* — `len` is always the
nonzero length of a payload being written, never 0
(official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2319-L4021 — no call site passes
`len=0`). Register values instead arrive unsolicited: once connected (and, for "new version"
controllers, unlocked per §4.3), the controller continuously streams 16-byte frames over the
notify characteristic; `SetReadValue` demultiplexes them by the low 7 bits of byte 1 and
republishes each as a `"ReadParaMeter"` message
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6162,#L6230-L6235), which each page
further maps through its own address table (§2 RX row 2).

`encode_read()` below is therefore **constructed, not observed**: it hand-executes the
documented `WriteAddr` algorithm (§2 TX, §3) with `payload_len=0` — a valid input to that
function's signature (`len` is an unconstrained `byte`/`ushort` parameter) that no call site
in the decompiled app happens to exercise. This is flagged here, in the code's docstring, and
in `docs/decompile-notes.md` so a real BLE capture can confirm or override it. (Secondary,
non-blocking corroboration: Worthless's native bridge separately declares
`fdBuildReadPacket(int)` taking only an address, distinct from
`fdBuildWritePacket(int, byte[])` taking address+payload — same read/write split, though its
native byte layout isn't decompilable; see `docs/decompile-notes.md`.)

TX (constructed): reading register 23 — the same "RatedVoltage" register written in §4.2, for
a direct comparison — with `payload_len=0`.

Arithmetic (`WriteAddr(data=[], addr=23, len=0)`): `len = 0 + 4 = 4`; `cmd = 0xC0 + 4 = 0xC4`;
`body = [0xAA, 0xC4, 0x17, 0x17]` (addr `23 = 0x17`, duplicated). Checksum loop over `body`
(init `b=0x3C, b2=0x7F`):

| byte | idx = b^byte | crctablehi[idx] | crctablelo[idx] | new b | new b2 |
|---|---|---|---|---|---|
| 0xAA | 0x96 | 0xFF | 0x6E | 0xFF | 0x6E |
| 0xC4 | 0x3B | 0x2F | 0xD3 | 0x2F | 0xD3 |
| 0x17 | 0x38 | 0xD2 | 0xD2 | 0xD2 | 0xD2 |
| 0x17 | 0xC5 | 0x12 | 0x53 | 0x12 | 0x53 |

Final checksum bytes: `0x12, 0x53`.

```
TX: AA C4 17 17 12 53
```

RX: since there is no dedicated read-response — the controller answers with whatever ordinary
telemetry frame next carries register 23's value — the RX example instead demonstrates the
general telemetry frame shape (§2 RX row), using the FlashReadAddr index 0 case (which maps
to logical id 226 — rotation / BMS-hall bits,
official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L177,#L891): `cmd = 0x80 | 0 = 0x80`,
payload bytes 8-9 hold rotation as a little-endian uint16 (chosen as `1500` rpm = `0x05DC` →
low byte `0xDC` at offset 8, high byte `0x05` at offset 9), all other payload bytes `0x00`.
Checksum over the 14-byte body `[0xAA,0x80,0,0,0,0,0,0,0xDC,0x05,0,0,0,0]` (same loop as
above, init `b=0x3C,b2=0x7F`) yields final bytes `0x1D, 0x34`.

```
RX: AA 80 00 00 00 00 00 00 DC 05 00 00 00 00 1D 34
```

### 4.2 Write register

TX: writing register 23 ("RatedVoltage", inferred from the UI label and encoding — see
`RatedVol_Clicked`, official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2391-L2415) to
48V. The user picks a voltage class string (e.g. `" 48V"`); the app computes
`num = Convert.ToInt16(title) = 48`, then `num *= 10 = 480` (`0x01E0`), and calls
`WriteAddr(new byte[8]{0,0,0,0,(byte)num,(byte)(num>>8),0,0}, 23, 2)`
(official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2402-L2413).

Arithmetic: `len = 2 + 4 = 6`; `cmd = 0xC0 + 6 = 0xC6`; `addr = 23 = 0x17` (duplicated);
`payload = [0xE0, 0x01]` (480 little-endian); `body = [0xAA, 0xC6, 0x17, 0x17, 0xE0, 0x01]`.
Checksum loop (init `b=0x3C, b2=0x7F`):

| byte | idx = b^byte | crctablehi[idx] | crctablelo[idx] | new b | new b2 |
|---|---|---|---|---|---|
| 0xAA | 0x96 | 0xFF | 0x6E | 0xFF | 0x6E |
| 0xC6 | 0x39 | 0xAE | 0x12 | 0xAE | 0x12 |
| 0x17 | 0xB9 | 0xD3 | 0xB2 | 0xD3 | 0xB2 |
| 0x17 | 0xC4 | 0xB3 | 0x93 | 0xB3 | 0x93 |
| 0xE0 | 0x53 | 0xD3 | 0x3D | 0xD3 | 0x3D |
| 0x01 | 0xD2 | 0xBD | 0x5D | 0xBD | 0x5D |

Final checksum bytes: `0xBD, 0x5D`.

```
TX: AA C6 17 17 E0 01 BD 5D
```

RX/ack: **none**. `WriteAddr` fires the write and returns; it never awaits or checks a reply
(official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2319-L2334). The write is confirmed,
if at all, only indirectly — by the register's new value eventually appearing in the ordinary
unsolicited telemetry stream (§4.1).

### 4.3 Unlock / password

**Yes, there is one** (for "new version" controllers) — `SendRs232DataPass`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3972-L4009), gated by
`logincount<1` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3795-L3798), with
`id = Convert.ToUInt32(App.clientid)` — the app's bound-controller client id (from a separate
pairing/bind flow, §1 step 5).

**Trigger**: `logincount` defaults to `1` (official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L307),
so the gate above starts closed. It's reset to `0` — unblocking the send on the app's next
"maintain" tick — only when the app receives a `cmd=0x7C` RX frame from the controller (§2 RX
family 2): `official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6350-L6357`:

```csharp
else if (m_Received[0] == 170 && (m_Received[1] & 0xFC) == 124)  // 124 = 0x7C
{
    switch (m_Received[1])
    {
    case 124:
        App.rcv_serialNumber = "VCUFarDriverA" + serial_from_bytes_2_to_5(m_Received);
        logincount = 0;
        break;
    }
}
```

Worked RX example: the controller announcing serial `1234567` (the same id used in the TX
unlock example below, to show the real cause → effect). Bytes 2-5 are the serial as a
little-endian uint32 (`0x0012D687`); bytes 6-13 zero (not otherwise populated in this code
path); checksum is §3.2's additive sum, high byte first: `sum(bytes[0..13]) = 0x0295`.

```
RX (trigger): AA 7C 87 D6 12 00 00 00 00 00 00 00 00 00 02 95
```

So the unlock sequence, in order, is: **controller sends `0x7C` with its serial → app's next
maintain tick sees `logincount<1` → app sends the `TX (pass)` frame below with `id =
App.clientid`** (a value the app already had from binding, not parsed out of the `0x7C`
frame's serial — they're expected to match for a correctly-bound device, but the code never
asserts that).

Algorithm: XOR-scrambles a fixed ASCII key, `"D'1qF83x"`, against a value derived from `id`
via a linear transform, then packs the result into a 16-byte frame with `cmd=0x7F` (127) and
`id` itself (little-endian) at offset 2-5:

```
num  = id * 55571701 + 55571699                      (mod 2^32)
num2 = key[3]<<24 | key[2]<<16 | key[1]<<8 | key[0]   ("D'1q" as a little-endian uint32)
num3 = key[7]<<24 | key[6]<<16 | key[5]<<8 | key[4]   ("F83x" as a little-endian uint32)
num4 = num2 ^ num
num5 = num3 ^ num
frame = [0xAA, 0x7F, id&0xFF, (id>>8)&0xFF, (id>>16)&0xFF, (id>>24)&0xFF,
         num4&0xFF, (num4>>8)&0xFF, (num4>>16)&0xFF, (num4>>24)&0xFF,
         num5&0xFF, (num5>>8)&0xFF, (num5>>16)&0xFF, (num5>>24)&0xFF,
         0, 0]
```

**Checksum is a different, simpler algorithm from §3**: a plain 16-bit additive sum over
bytes 0-13, stored **low byte first** — `frame[14] = (byte)sum; frame[15] = (byte)(sum>>8);`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4018-L4024) — the opposite byte
order from the CRC16 checksum, and not a CRC at all. It is intentionally **not** implemented
by `fardriver_frame.checksum()`, which only covers the §3 algorithm used by ordinary register
read/write frames; this is called out again in `docs/decompile-notes.md`.

Worked example for `id = 1234567` (an arbitrary but realistic 7-digit client id — the real
value is a per-install runtime binding, not a literal in the source, so it is chosen here to
demonstrate the arithmetic per the doc's honesty rule):

```
num  = (1234567 * 55571701 + 55571699) mod 2^32 = 0xD278F026
num2 = 0x71312744   ("D'1q" LE)
num3 = 0x78333846   ("F83x" LE)
num4 = num2 ^ num = 0xA349D762
num5 = num3 ^ num = 0xAA4BC860
sum(bytes[0..13]) & 0xFFFF = 0x06DA
```

```
TX (pass): AA 7F 87 D6 12 00 62 D7 49 A3 60 C8 4B AA DA 06
```

**Response**: there is no dedicated "unlock ack" frame. Success is read back out of specific
bit fields inside otherwise-ordinary telemetry frames that the app already parses, e.g.
`App.PassOk = (arg[3] & 0x18) >> 3`, `App.PassOk = (arg[5] & 0xC) >> 2`, and
`App.PassOk = arg[10] & 3` in different telemetry cases
(official:official/src/MotorNet6/MotorNet6/GraphPage.cs#L1548,#L2086,#L3345). Until then, the
app keeps re-sending low-level "maintain" pings (`SendRs232Data(19, 7, ...)`,
official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3762-L3790).

There is also a **legacy unlock path** for `!App.NewVersion` controllers,
`App.CacuDiscover` (official:official/src/MotorNet6/MotorNet6/App.cs#L500-L524, invoked from
official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3791): it derives a 21-element key
array from a fixed seed and the controller's serial number via a chain of per-byte
linear-congruential-style transforms (`Discover[n] = (Discover[n-1] + K1) * K2 + K3 +
serial[n]`, with distinct magic constants per index). Not reduced to concrete bytes here — the
serial number input isn't a literal in the source and isn't observable without a live device,
so no hex example is derivable without inventing data; flagged as an open item in
`docs/decompile-notes.md`, not blocking this task since the primary (`NewVersion`) unlock
above is fully documented.

`CMD5.cs` (official:official/src/MotorNet6/MotorNet6/CMD5.cs#L5,#L17,#L56) — an MD5
implementation with `hexstr_to_md5` and an XOR `Add` method — is **not** the unlock mechanism.
It is dead code in this app build: no other file under `MotorNet6/*.cs` instantiates `CMD5`
or calls either of its methods.

### 4.4 Other commands seen

| cmd byte(s) | Purpose | Source |
|---|---|---|
| `0xC0 \| (len+4)` (TX, top bit set) | Register write (§4.2), also used here for the constructed register read (§4.1) | official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2319 |
| `0xFF` / `0xFE` (TX, `WriteAddr` with `len==388`/`len==316` after the `+=4`) | Large parameter block / firmware download transfer, chunked into 20-byte sub-writes | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4339-L4410 |
| `0x80 \| index` (RX family 1, top bit set, index 0-127 — **note**: this range overlaps the TX `0xC0`-`0xFF` byte values above; only direction, TX vs. RX, disambiguates them, not the cmd byte's value) | Unsolicited telemetry/parameter frame from the controller (§2 RX family 1, §4.1) | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6187 |
| `0x7F` (127, TX, top bit set) | Unlock/password handshake (§4.3) | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3972 |
| `0x1F` (RX family 2, top bit clear) | Firmware/download acknowledgement — sub-command in byte 2 (== byte 3): `1`=CRC seed, `2`/`4`=nack, `3`=ack, `124`/`125`=ack, `126`=neutral, default=ack | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6290-L6349 |
| `0x7C` (124, RX family 2, top bit clear) | Serial-number/login-trigger frame — resets `logincount=0`, the gate that unblocks the §4.3 unlock send (§1 step 5, §4.3 "Trigger") | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L6350-L6357 |
| Legacy `[0xAA, mcmd, ~mcmd, scmd, va1, va2, sum, ~sum]` 8-byte frame (`SendRs232Data`, not the `WriteAddr` shape at all — `mcmd`/`scmd` are opcodes, not a register address) | Pre-CRC16 "old" command protocol: maintain-pings (`mcmd=19,scmd=7`), password confirmation digits (`mcmd=19,scmd=12/13`), firmware-update triggers (`mcmd=4`), direction/voltage writes for `!App.NewVersion` controllers | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3947-L3966, official:official/src/MotorNet6/MotorNet6/ParaPage.cs#L2305-L2316 |
| `WriteSysCmd(cmd)` → `WriteAddr([...,cmd,...], addr=0xA0, len=2)` | Firmware-update mode select: `cmd=15` ISOLATE variant, `cmd=16` CG56 variant, `cmd=5` default, sent right before a firmware download | official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L4321-L4326,#L5128-L5138 |

Legacy 8-byte frame's own checksum is a **fourth** algorithm (see §3's summary table) — plain
additive sum then one's-complement, no CRC table at all: `sum = (0xAA+mcmd+~mcmd+scmd+va1+va2)
& 0xFF`, then `frame[6]=sum, frame[7]=~sum`
(official:official/src/MotorNet6/MotorNet6/ConnectPage.cs#L3953-L3961). Not implemented by
`fardriver_frame.py` — it has no register `addr`, so it doesn't fit this task's
`encode_read`/`encode_write`/`decode` interface (which models the CRC16 `WriteAddr` protocol
in §2-§3.1, plus RX family 2's additive-sum in §2/§3.2 for `decode()`).
