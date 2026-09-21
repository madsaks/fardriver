"""Reference implementation of FarDriver BLE framing.

Written from docs/protocol.md; that document cites the decompiled source (the official
288 app's `WriteAddr` / `SetReadValue`, in `MotorNet6/ParaPage.cs` and
`MotorNet6/ConnectPage.cs`) for every constant here. Pure Python, no deps — phase 2 ports
this to TypeScript.

Two frame shapes share the same checksum (§3 of the doc):

- TX ("command") frames, built by `encode_read`/`encode_write`, mirror the official app's
  `WriteAddr`: header, a cmd byte whose top 2 bits are fixed `0b11` and whose low 6 bits
  encode `payload_len + 4`, a duplicated register address, the payload, then the checksum.
  Length is variable: `6 + payload_len` bytes. NOTE: the official app never sends a discrete
  "read register" request (see docs/protocol.md §4.1) — `encode_read` is a constructed frame
  (WriteAddr's algorithm applied with a zero-length payload), not one lifted from an observed
  call site.
- RX ("telemetry") frames, produced by the controller and parsed by `decode`, mirror
  `SetReadValue`: header, a cmd byte whose top bits are `0b10`, 12 bytes of payload, then the
  checksum. Length is fixed at 16 bytes. These carry no address subfield at this layer (the
  cmd byte's low 7 bits are an index a register table maps to a logical parameter id — out of
  scope for this module; see the later register-table task).
"""

from dataclasses import dataclass

HEADER = 0xAA

# TX ("command") frame cmd-byte shape: top 2 bits fixed at 0b11, low 6 bits are the covered
# length (payload_len + 4). CMD_WRITE_MASK also matches the CMD_READ frame this module
# constructs, since both are built by the same WriteAddr-shaped algorithm.
CMD_WRITE_MASK = 0xC0

# RX ("telemetry") frame cmd-byte shape: top bit set, second-from-top bit clear.
CMD_DATA_MASK = 0x80
CMD_DATA_TAG = 0x80
CMD_DATA_TAG_BITS = 0xC0  # mask applied before comparing against CMD_DATA_TAG

FRAME_LEN = 16  # fixed length of RX telemetry frames only; TX frames are payload_len + 6

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
    """Decode either frame shape (§2 of docs/protocol.md).

    - A "command" frame (as built by `encode_read`/`encode_write`): cmd byte's top 2 bits are
      `0b11`; `addr` comes from byte 2 (duplicated at byte 3 by the encoder); payload is the
      bytes between the address and the checksum.
    - A "telemetry" frame (as streamed unsolicited by the controller and parsed by
      `SetReadValue`): cmd byte's top bits are `0b10`; fixed 16 bytes; no address subfield at
      this layer, so `addr` is None and `payload` is the 12 middle bytes.

    Any length/shape mismatch, or a bad header byte, yields `checksum_ok=False` rather than
    raising, so a caller can always inspect the result.
    """
    if len(frame) < 4 or frame[0] != HEADER:
        cmd = frame[1] if len(frame) > 1 else 0
        return Frame(cmd=cmd, addr=None, payload=b"", checksum_ok=False)

    cmd = frame[1]

    if cmd & CMD_WRITE_MASK == CMD_WRITE_MASK:
        covered_len = cmd & 0x3F  # payload_len + 4, per WriteAddr
        total_len = covered_len + 2
        if covered_len < 4 or len(frame) != total_len:
            return Frame(cmd=cmd, addr=None, payload=b"", checksum_ok=False)
        body = frame[:covered_len]
        addr = frame[2]
        payload = frame[4:covered_len]
        expected = int.from_bytes(frame[covered_len:covered_len + 2], "big")
    elif cmd & CMD_DATA_TAG_BITS == CMD_DATA_TAG:
        if len(frame) != FRAME_LEN:
            return Frame(cmd=cmd, addr=None, payload=b"", checksum_ok=False)
        body = frame[:14]
        addr = None
        payload = frame[2:14]
        expected = int.from_bytes(frame[14:16], "big")
    else:
        return Frame(cmd=cmd, addr=None, payload=bytes(frame[2:-2]), checksum_ok=False)

    ok = checksum(body) == expected
    return Frame(cmd=cmd, addr=addr, payload=bytes(payload), checksum_ok=ok)
