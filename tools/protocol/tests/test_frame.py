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
