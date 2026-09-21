from fardriver_frame import checksum, encode_read, encode_write, decode

# Bytes below are exactly the hex examples in docs/protocol.md sections 4.1/4.2 — see that
# doc for the byte-by-byte arithmetic (the checksum table walk) each example was derived
# with.

# §4.1 TX — constructed read of register 23 ("RatedVoltage"). See docs/protocol.md §4.1 for
# why this is a constructed (not observed) frame: the official app never sends a discrete
# "read register" request; this hand-executes the documented WriteAddr algorithm with a
# zero-length payload.
READ_TX = bytes.fromhex("aac417171253")
READ_ADDR = 0x17  # 23 decimal — RatedVoltage register (ParaPage.cs RatedVol_Clicked)

# §4.2 TX — write register 23 ("RatedVoltage") to 480 (48V * 10), matching the official app's
# RatedVol_Clicked handler for the " 48V" menu choice.
WRITE_TX = bytes.fromhex("aac61717e001bd5d")
WRITE_ADDR, WRITE_VALUE = 0x17, 480

# §4.1 RX — a telemetry/parameter frame in the shape SetReadValue parses, using FlashReadAddr
# index 0 (-> logical id 226, rotation/BMS-hall bits). Rotation payload chosen as 1500 rpm
# (0x05DC) at bytes 8-9; all other payload bytes zero. See docs/protocol.md §4.1 for the full
# checksum arithmetic.
RX_FRAME = bytes.fromhex("aa80000000000000dc05000000001d34")

# §2/§4.4 RX — a telemetry/parameter frame with index 72 (cmd = 0x80|72 = 0xC8, i.e. cmd byte
# 0xC8-0xD7 territory, the "index >= 64" case fix-round-1 finding 1 flagged: decode() must
# treat this the same as any other top-bit-set cmd, not mistake it for a TX command-frame
# cmd byte). All-zero payload; see docs/protocol.md §2 for the checksum arithmetic.
RX_FRAME_INDEX_72 = bytes.fromhex("aac800000000000000000000000023e0")

# §4.3/§4.4 RX — the 0x7C serial-number/login-trigger frame (SetReadValue's second, top-bit-
# clear RX family; additive-sum checksum, stored high byte first). Serial 1234567 — the same
# id docs/protocol.md §4.3's unlock TX example uses, since this is the frame that triggers
# that example's unlock frame in the real connect sequence. See docs/protocol.md §4.3/§3 for
# the checksum arithmetic (sum of bytes 0-13 = 0x0295).
RX_FRAME_SERIAL = bytes.fromhex("aa7c87d6120000000000000000000295")


def test_checksum_matches_doc_example():
    body, expected = READ_TX[:-2], READ_TX[-2:]
    assert checksum(body) == int.from_bytes(expected, "big")


def test_encode_read_matches_doc():
    assert encode_read(READ_ADDR) == READ_TX


def test_encode_write_matches_doc():
    assert encode_write(WRITE_ADDR, WRITE_VALUE) == WRITE_TX


def test_decode_rx_frame():
    f = decode(RX_FRAME)
    assert f.checksum_ok
    assert f.cmd == RX_FRAME[1]


def test_decode_rejects_bad_checksum():
    bad = bytearray(RX_FRAME)
    bad[-1] ^= 0xFF
    assert not decode(bytes(bad)).checksum_ok


def test_decode_rx_frame_with_index_ge_64():
    # Fix round 1, finding 1: decode() must not mistake a real telemetry cmd byte in the
    # 0xC0-0xFF range (index 64-127) for a TX command-frame cmd byte. Any RX cmd with the top
    # bit set is a 16-byte telemetry frame per official:ConnectPage.cs#L6187, regardless of
    # its low 6/7 bits.
    f = decode(RX_FRAME_INDEX_72)
    assert f.checksum_ok
    assert f.cmd == 0xC8
    assert f.cmd & 0x7F == 72
    assert f.addr is None


def test_decode_rx_serial_frame_additive_checksum():
    # Fix round 1, finding 4: the top-bit-clear RX family (§4.4) uses a different, additive
    # checksum from the CRC16 family above, stored high byte first.
    f = decode(RX_FRAME_SERIAL)
    assert f.checksum_ok
    assert f.cmd == 0x7C
    assert f.addr is None
