"""Reference implementation of FarDriver BLE framing.

Written from docs/protocol.md; that document cites the decompiled source (the official
288 app's `WriteAddr` / `SetReadValue`, in `MotorNet6/ParaPage.cs` and
`MotorNet6/ConnectPage.cs`) for every constant here. Pure Python, no deps — phase 2 ports
this to TypeScript.

Frames flow in one direction each; `encode_read`/`encode_write` and `decode` are not inverses
of each other:

- TX ("command") frames, built by `encode_read`/`encode_write`, mirror the official app's
  `WriteAddr`: header, a cmd byte whose top 2 bits are fixed `0b11` and whose low 6 bits
  encode `payload_len + 4`, a duplicated register address, the payload, then the §3 CRC16
  checksum. Length is variable: `6 + payload_len` bytes. NOTE: the official app never sends a
  discrete "read register" request (see docs/protocol.md §4.1) — `encode_read` is a
  constructed frame (WriteAddr's algorithm applied with a zero-length payload), not one
  lifted from an observed call site.
- RX ("telemetry"/"parameter") frames, produced by the controller and consumed by `decode`,
  mirror `SetReadValue` (official:MotorNet6/ConnectPage.cs#L6162-L6364). `decode` is RX-only:
  it decodes notify bytes received from the controller, not the TX bytes this module sends.
  Every RX frame is fixed at 16 bytes, but there are two families, selected purely by whether
  cmd's top bit is set (official:MotorNet6/ConnectPage.cs#L6187):
  - top bit set: the general telemetry/parameter frame (§2, §4.1), checksummed with the §3
    CRC16;
  - top bit clear: a second family (§4.4) — `cmd=0x1F` (firmware/download acks) and `cmd=0x7C`
    (the serial-number/login-trigger frame, §4.3) — checksummed with a plain 16-bit additive
    sum over bytes 0-13, stored high byte first (the opposite placement from the §4.3
    unlock/password TX frame's own additive-sum checksum, which is low-byte-first).
"""

import json
from dataclasses import dataclass
from pathlib import Path

HEADER = 0xAA

# TX ("command") frame cmd-byte shape: top 2 bits fixed at 0b11, low 6 bits are the covered
# length (payload_len + 4). Used by encode_read/encode_write only — decode() is RX-only and
# does not use this constant (see module docstring).
CMD_WRITE_MASK = 0xC0

FRAME_LEN = 16  # fixed length of RX frames (both families); TX frames are payload_len + 6

# §3: checksum lookup tables. Byte-for-byte identical to the standard CRC-16/MODBUS tables;
# copied verbatim from official:MotorNet6/ConnectPage.cs (crctablelo/crctablehi, lines
# 155-213). See docs/protocol.md §3 and docs/decompile-notes.md for the citation.
_CRC_LO = bytes([
    0, 192, 193, 1, 195, 3, 2, 194, 198, 6,
    7, 199, 5, 197, 196, 4, 204, 12, 13, 205,
    15, 207, 206, 14, 10, 202, 203, 11, 201, 9,
    8, 200, 216, 24, 25, 217, 27, 219, 218, 26,
    30, 222, 223, 31, 221, 29, 28, 220, 20, 212,
    213, 21, 215, 23, 22, 214, 210, 18, 19, 211,
    17, 209, 208, 16, 240, 48, 49, 241, 51, 243,
    242, 50, 54, 246, 247, 55, 245, 53, 52, 244,
    60, 252, 253, 61, 255, 63, 62, 254, 250, 58,
    59, 251, 57, 249, 248, 56, 40, 232, 233, 41,
    235, 43, 42, 234, 238, 46, 47, 239, 45, 237,
    236, 44, 228, 36, 37, 229, 39, 231, 230, 38,
    34, 226, 227, 35, 225, 33, 32, 224, 160, 96,
    97, 161, 99, 163, 162, 98, 102, 166, 167, 103,
    165, 101, 100, 164, 108, 172, 173, 109, 175, 111,
    110, 174, 170, 106, 107, 171, 105, 169, 168, 104,
    120, 184, 185, 121, 187, 123, 122, 186, 190, 126,
    127, 191, 125, 189, 188, 124, 180, 116, 117, 181,
    119, 183, 182, 118, 114, 178, 179, 115, 177, 113,
    112, 176, 80, 144, 145, 81, 147, 83, 82, 146,
    150, 86, 87, 151, 85, 149, 148, 84, 156, 92,
    93, 157, 95, 159, 158, 94, 90, 154, 155, 91,
    153, 89, 88, 152, 136, 72, 73, 137, 75, 139,
    138, 74, 78, 142, 143, 79, 141, 77, 76, 140,
    68, 132, 133, 69, 135, 71, 70, 134, 130, 66,
    67, 131, 65, 129, 128, 64,
])

_CRC_HI = bytes([
    0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
    128, 65, 0, 193, 129, 64, 1, 192, 128, 65,
    0, 193, 129, 64, 0, 193, 129, 64, 1, 192,
    128, 65, 1, 192, 128, 65, 0, 193, 129, 64,
    0, 193, 129, 64, 1, 192, 128, 65, 0, 193,
    129, 64, 1, 192, 128, 65, 1, 192, 128, 65,
    0, 193, 129, 64, 1, 192, 128, 65, 0, 193,
    129, 64, 0, 193, 129, 64, 1, 192, 128, 65,
    0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
    128, 65, 0, 193, 129, 64, 0, 193, 129, 64,
    1, 192, 128, 65, 1, 192, 128, 65, 0, 193,
    129, 64, 1, 192, 128, 65, 0, 193, 129, 64,
    0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
    128, 65, 0, 193, 129, 64, 0, 193, 129, 64,
    1, 192, 128, 65, 0, 193, 129, 64, 1, 192,
    128, 65, 1, 192, 128, 65, 0, 193, 129, 64,
    0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
    128, 65, 0, 193, 129, 64, 1, 192, 128, 65,
    0, 193, 129, 64, 0, 193, 129, 64, 1, 192,
    128, 65, 0, 193, 129, 64, 1, 192, 128, 65,
    1, 192, 128, 65, 0, 193, 129, 64, 1, 192,
    128, 65, 0, 193, 129, 64, 0, 193, 129, 64,
    1, 192, 128, 65, 1, 192, 128, 65, 0, 193,
    129, 64, 0, 193, 129, 64, 1, 192, 128, 65,
    0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
    128, 65, 0, 193, 129, 64,
])

_CRC_INIT_B, _CRC_INIT_B2 = 0x3C, 0x7F


def checksum(payload: bytes) -> int:
    """Table-based CRC16 (docs/protocol.md §3): identical tables to CRC-16/MODBUS, but with
    a non-standard initial register value of (0x3C, 0x7F) instead of the standard (0xFF,
    0xFF). Covers every byte of the frame except the checksum's own two trailing bytes.

    Returns the 16-bit result as (b_final << 8) | b2_final, where b/b2 are the running state
    from the decompiled loop (official:MotorNet6/ParaPage.cs#L2326-L2334,
    official:MotorNet6/ConnectPage.cs#L6196-L6204) — this is exactly the byte order the two
    result bytes are appended to the frame in (b first, then b2).
    """
    b, b2 = _CRC_INIT_B, _CRC_INIT_B2
    for byte in payload:
        idx = (b ^ byte) & 0xFF
        b, b2 = (b2 ^ _CRC_HI[idx]) & 0xFF, _CRC_LO[idx]
    return (b << 8) | b2


def _append_checksum(body: bytearray) -> bytes:
    crc = checksum(bytes(body))
    body.append((crc >> 8) & 0xFF)
    body.append(crc & 0xFF)
    return bytes(body)


def _rx_additive_checksum(body: bytes) -> int:
    """The second RX checksum family (docs/protocol.md §3/§4.4): a plain 16-bit additive sum
    over the covered bytes, with no lookup table
    (official:MotorNet6/ConnectPage.cs#L6282-L6287, `rcv_crc`). Returned as a 16-bit int whose
    big-endian byte representation is the placement order actually used on the wire for this
    family: high byte first, then low byte — the opposite placement from `checksum()`'s
    result, which is also appended big-endian but is a different (CRC16) value.
    """
    return sum(body) & 0xFFFF


def encode_read(addr: int) -> bytes:
    """Constructed (not observed) — see the module docstring and docs/protocol.md §4.1: no
    call site in the official app passes a zero-length payload to WriteAddr, but the
    algorithm accepts one. This applies it with payload_len=0.
    """
    body = bytearray([HEADER, CMD_WRITE_MASK | 4, addr & 0xFF, addr & 0xFF])
    return _append_checksum(body)


def encode_write(addr: int, value: int) -> bytes:
    """Write a 2-byte little-endian register value, mirroring the official app's
    `WriteAddr(data, addr, len=2)` call sites (e.g. RatedVol_Clicked, docs/protocol.md §4.2).
    """
    payload_len = 2
    body = bytearray([
        HEADER,
        CMD_WRITE_MASK | (payload_len + 4),
        addr & 0xFF,
        addr & 0xFF,
        value & 0xFF,
        (value >> 8) & 0xFF,
    ])
    return _append_checksum(body)


@dataclass(frozen=True)
class Frame:
    cmd: int
    addr: int | None
    payload: bytes
    checksum_ok: bool


def decode(frame: bytes) -> Frame:
    """Decode a 16-byte RX frame — notify bytes received *from* the controller — mirroring
    `SetReadValue` (official:MotorNet6/ConnectPage.cs#L6162-L6364). **RX-only**: this function
    does not decode the TX command frames `encode_read`/`encode_write` build; those are
    app-to-controller only and are never read back by this module (see the module docstring).

    Every RX frame is fixed at `FRAME_LEN` (16) bytes. Which of the two RX checksum families
    applies is selected purely by whether cmd's top bit is set
    (official:MotorNet6/ConnectPage.cs#L6187, `(m_Received[1] & 0x80) == 128`):

    - Top bit set (`cmd & 0x80`): the general telemetry/parameter frame (§2, §4.1). `cmd &
      0x7F` is a 0-127 index that a per-page `FlashReadAddr` table further maps to a logical
      parameter id — out of scope for this module (see the later register-table task).
      Checksummed with the §3 CRC16 (`checksum()`).
    - Top bit clear: the second RX family (§4.4) — e.g. `cmd=0x1F` (firmware/download acks)
      and `cmd=0x7C` (the serial-number/login-trigger frame, §4.3). Checksummed with a plain
      16-bit additive sum over bytes 0-13, stored high byte first
      (`_rx_additive_checksum()`).

    `addr` is always `None`: neither RX family carries a single-byte register address at this
    layer (contrast with the TX command frames `encode_read`/`encode_write` build). Any
    length/header mismatch yields `checksum_ok=False` rather than raising, so a caller can
    always inspect the result.
    """
    if len(frame) != FRAME_LEN or frame[0] != HEADER:
        cmd = frame[1] if len(frame) > 1 else 0
        return Frame(cmd=cmd, addr=None, payload=b"", checksum_ok=False)

    cmd = frame[1]
    body = frame[:14]
    payload = frame[2:14]

    if cmd & 0x80:
        ok = checksum(body) == int.from_bytes(frame[14:16], "big")
    else:
        ok = int.from_bytes(frame[14:16], "big") == _rx_additive_checksum(body)

    return Frame(cmd=cmd, addr=None, payload=bytes(payload), checksum_ok=ok)


_TELEMETRY_PATH = Path(__file__).resolve().parents[2] / "protocol/telemetry.json"

# Byte width implied by each protocol/schema/telemetry.schema.json `type` value. `bitfield`
# entries in protocol/telemetry.json are always the 2-byte (u16) little-endian status/fault
# words documented in docs/protocol.md §6 — matching the convention protocol/registers.json's
# own `bitfield` entries already use (always a full register word, never a lone byte).
_TELEMETRY_TYPE_WIDTH = {
    "u8": 1, "i8": 1,
    "u16": 2, "i16": 2,
    "u32": 4, "i32": 4,
    "bitfield": 2,
    "enum": 1,  # not used by any current protocol/telemetry.json entry; u8 is the conservative default
}
_TELEMETRY_TYPE_SIGNED = {"i8": True, "i16": True, "i32": True}

# §6 (fix round 1, finding 2): the RX family-1 index -> logical-id table, `FlashReadAddr[55]`.
# Byte-identical across every page that declares it — official:MotorNet6/ParaPage.cs#L177-184,
# official:MotorNet6/GraphPage.cs#L182, official:MotorNet6/CurvePage.cs#L187,
# official:MotorNet6/StatPage.cs#L11, official:MotorNet6/ProControlPage.cs#L415 — so it's a
# protocol fact (which cmd bytes carry which logical content), not a per-page implementation
# detail; see docs/protocol.md §6 for the annotated version of this same table. `cmd = 0x80 |
# index`; only indices 0-54 are valid (index 55 and the 56-87 App.gcflash special case are a
# different mechanism entirely — official:MotorNet6/ConnectPage.cs#L6211-L6222 — and are not
# covered by this table).
FLASH_READ_ADDR = [
    226, 232, 238, 0, 6, 12, 18, 226, 232, 238,
    24, 30, 36, 42, 226, 232, 238, 48, 93, 99,
    105, 226, 232, 238, 124, 130, 136, 142, 226, 232,
    238, 148, 154, 160, 166, 226, 232, 238, 172, 178,
    184, 190, 226, 232, 238, 196, 202, 208, 226, 232,
    238, 214, 220, 244, 250,
]


def _canonical_telemetry_cmd_for(cmd: int) -> int:
    """Normalizes a real-world RX cmd byte to the lowest cmd byte that carries the same
    logical id in `FLASH_READ_ADDR`, per docs/protocol.md §6 (fix round 1, finding 2): ids
    226/232/238 each repeat at 8 different indices/cmd bytes across the 55-entry cycle (e.g.
    id 226 also at `0x87`/`0x8E`/`0x95`/.../`0xB0`, not just its lowest-index `0x80`), and
    `protocol/telemetry.json` only records entries under each id's lowest (canonical) cmd
    byte. Returns `cmd` unchanged if its index is out of `FLASH_READ_ADDR`'s range (top-bit-
    clear frames never reach here — see `decode()` — and indices 55+ have no entry in this
    table), or if its id has no canonical cmd byte in `telemetry.json` at all — either way the
    caller's `telemetry.json` lookup on the returned value will simply find nothing.
    """
    index = cmd & 0x7F
    if index >= len(FLASH_READ_ADDR):
        return cmd
    telemetry_id = FLASH_READ_ADDR[index]
    canonical_index = FLASH_READ_ADDR.index(telemetry_id)  # first (lowest) occurrence
    return 0x80 | canonical_index


_telemetry_fields_cache: list[dict] | None = None


def _load_telemetry_fields() -> list[dict]:
    """Loads and caches protocol/telemetry.json (docs/protocol.md §6's field table)."""
    global _telemetry_fields_cache
    if _telemetry_fields_cache is None:
        with open(_TELEMETRY_PATH, encoding="utf-8") as f:
            _telemetry_fields_cache = json.load(f)
    return _telemetry_fields_cache


def decode_telemetry(frame: Frame) -> dict[str, float | int]:
    """Decodes a telemetry-bearing `Frame` (from `decode()`) into `{key: value}` per
    `protocol/telemetry.json` (docs/protocol.md §6). `frame.cmd` is first normalized through
    `FLASH_READ_ADDR` (`_canonical_telemetry_cmd_for`) to the canonical cmd byte for its
    logical id, then matched against `telemetry.json`'s `frame` field (as `"0xNN"`, e.g.
    `"0x80"`) — so e.g. cmd `0x87` (index 7, id 226) decodes identically to cmd `0x80` (index
    0, the same id). A frame carrying an id documented nowhere in telemetry.json (or a frame
    with `checksum_ok=False`) simply yields no entries for it — this function does not
    validate the checksum itself.

    Numeric types (`u8`/`i8`/`u16`/`i16`/`u32`/`i32`) are read little-endian per `entry["offset"]`
    (into `frame.payload`, the 12-byte RX payload — §6 states this offset convention) and
    scaled by `entry["scale"]`. **`bitfield` entries return the raw integer word, unscaled, as
    `int` (not `float`)** — so callers can mask individual bits/sub-fields directly (`result[
    "fault_status_word"] & 1`) without a cast; the return type is `dict[str, float | int]`
    accordingly. A bitfield's `enum` documents bit-index -> meaning; masking multi-bit
    sub-fields out of the word is still the caller's job (see §6's `gear_status_flags`/
    `fault_status_word` notes for worked examples this function does not isolate on its own).
    """
    frame_id = f"0x{_canonical_telemetry_cmd_for(frame.cmd):02X}"
    result: dict[str, float | int] = {}
    for entry in _load_telemetry_fields():
        if entry["frame"] != frame_id:
            continue
        offset = entry["offset"]
        width = _TELEMETRY_TYPE_WIDTH[entry["type"]]
        raw_bytes = frame.payload[offset:offset + width]
        if len(raw_bytes) < width:
            continue
        raw = int.from_bytes(raw_bytes, "little", signed=_TELEMETRY_TYPE_SIGNED.get(entry["type"], False))
        if entry["type"] == "bitfield":
            result[entry["key"]] = raw
        else:
            result[entry["key"]] = raw * entry["scale"]
    return result
