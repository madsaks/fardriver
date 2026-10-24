# /// script
# requires-python = ">=3.11"
# dependencies = ["unicorn==2.1.4", "pyelftools==0.33"]
# ///
"""Offline AArch64 checks against the local Worthless native library.

Usage: uv run tools/protocol/verify_native.py [--output result.json]
No library is loaded into the host process; no Bluetooth/network calls are made.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from elftools.elf.elffile import ELFFile
from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm64_const import UC_ARM64_REG_X0, UC_ARM64_REG_X1, UC_ARM64_REG_X2, UC_ARM64_REG_X30, UC_ARM64_REG_SP, UC_ARM64_REG_PC, UC_ARM64_REG_TPIDR_EL0

from fardriver_frame import encode_write, encode_read, checksum

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "reference/decompiled/worthless/native/arm64-v8a/libfd_protocol.so"
EXPECTED_SHA256 = "6d7b3f899c3c67ab2700c27c523a6aaf37efdd05d2d2f667da5ac60e809b471c"
INPUT, OUTPUT, STOP, STUBS = 0x400000, 0x480000, 0x600000, 0x700000


class NativeMachine:
    def __init__(self, library: Path):
        self.uc = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
        self.uc.mem_map(0, 0x100000)
        self.uc.mem_map(0x300000, 0x500000)
        self.imports = {}
        with library.open("rb") as stream:
            elf = ELFFile(stream)
            for segment in elf.iter_segments():
                if segment["p_type"] == "PT_LOAD":
                    self.uc.mem_write(segment["p_vaddr"], segment.data())
            symbols = elf.get_section_by_name(".dynsym")
            self.symbols = {s.name: s["st_value"] for s in symbols.iter_symbols() if s["st_value"]}
            for section in elf.iter_sections():
                if section["sh_type"] != "SHT_RELA":
                    continue
                for relocation in section.iter_relocations():
                    kind = relocation["r_info_type"]
                    if kind == 1027:  # R_AARCH64_RELATIVE, image loaded at zero
                        target = relocation["r_addend"]
                    elif kind in (1025, 1026):  # GLOB_DAT / JUMP_SLOT
                        symbol = symbols.get_symbol(relocation["r_info_sym"])
                        target = symbol["st_value"]
                        if not target:
                            target = STUBS + len(self.imports) * 4
                            self.imports[target] = symbol.name
                    else:
                        continue
                    self.uc.mem_write(relocation["r_offset"], struct.pack("<Q", target))
        self.uc.reg_write(UC_ARM64_REG_TPIDR_EL0, 0x300000)
        self.uc.hook_add(UC_HOOK_CODE, self._stub, begin=STUBS, end=STUBS + 0x10000)

    def _stub(self, uc, address, size, data):
        name = self.imports[address]
        a, b, c = [uc.reg_read(r) for r in (UC_ARM64_REG_X0, UC_ARM64_REG_X1, UC_ARM64_REG_X2)]
        if name in ("memcpy", "memmove", "__memcpy_chk"):
            uc.mem_write(a, bytes(uc.mem_read(b, c)))
        elif name == "memset":
            uc.mem_write(a, bytes([b & 255]) * c)
        elif name == "strlen":
            length = 0
            while uc.mem_read(a + length, 1)[0]:
                length += 1
            uc.reg_write(UC_ARM64_REG_X0, length)
        elif name in ("__strcpy_chk", "__strcat_chk", "strcpy", "strcat"):
            if "cat" in name:
                while uc.mem_read(a, 1)[0]:
                    a += 1
            content = bytearray()
            while uc.mem_read(b + len(content), 1)[0]:
                content.extend(uc.mem_read(b + len(content), 1))
            uc.mem_write(a, bytes(content) + b"\0")
        else:
            raise RuntimeError(f"Unmodeled native import: {name}")
        uc.reg_write(UC_ARM64_REG_PC, uc.reg_read(UC_ARM64_REG_X30))

    def call(self, name, *args):
        self.uc.reg_write(UC_ARM64_REG_SP, 0x5ff000)
        self.uc.reg_write(UC_ARM64_REG_X30, STOP)
        for index, value in enumerate(args):
            self.uc.reg_write(UC_ARM64_REG_X0 + index, value)
        self.uc.emu_start(self.symbols[name], STOP, count=5_000_000)
        if self.uc.reg_read(UC_ARM64_REG_PC) != STOP:
            raise RuntimeError(f"Instruction limit reached in {name}")
        return self.uc.reg_read(UC_ARM64_REG_X0)

    def output(self, length):
        return bytes(self.uc.mem_read(OUTPUT, length))


def verify(library: Path) -> dict:
    digest = hashlib.sha256(library.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError("Library hash differs from the reviewed version")
    machine = NativeMachine(library)
    result = {"librarySha256": digest, "execution": "Unicorn AArch64; memory/string imports modeled; no hardware", "checks": {}}
    # Independently authored expected frames, compared to actual native instructions.
    for address in range(256):
        assert machine.call("ncFdBuildReadPacket", address, OUTPUT) == 5
        prefix = bytes([address, address, 0x80])
        assert machine.output(5) == prefix + checksum(prefix).to_bytes(2, "big")
        assert machine.output(5) != encode_read(address)
    result["checks"]["readAddresses"] = 256
    for address in range(256):
        for length in (0, 1, 2, 6, 14, 15, 20):
            payload = bytes(range(length))
            machine.uc.mem_write(INPUT, payload or b"\0")
            size = machine.call("ncFdBuildWritePacket", address, INPUT, length, OUTPUT)
            body = bytes([0xaa, 0xc4 + min(length, 14), address, address]) + payload[:14]
            expected = body + checksum(body).to_bytes(2, "big")
            assert machine.output(size) == expected
            if length == 2:
                assert expected == encode_write(address, int.from_bytes(payload, "little"))
    result["checks"]["writeVectors"] = 256 * 7
    for args in ((19, 7, 10, 56), (4, 1, 38, 38), (0, 0, 0, 0), (255, 255, 255, 255)):
        command, sub, a, b = args
        total = (0xa9 + sub + a + b) & 255
        expected = bytes([0xaa, command, command ^ 255, sub, a, b, total, total ^ 255])
        assert machine.call("ncFdBuildOldCommand", *args, OUTPUT) == 8
        assert machine.output(8) == expected
    result["checks"]["legacyVectors"] = 4
    result["readExample"] = {}
    for address in (0, 38, 160, 255):
        machine.call("ncFdBuildReadPacket", address, OUTPUT)
        result["readExample"][str(address)] = machine.output(5).hex(" ")
    for name, key in (("ncFdGetPollRegisters", "pollRegisters"), ("ncFdGetConfigRegisters", "configRegisters")):
        size = machine.call(name, OUTPUT, 128)
        result[key] = list(machine.output(size))
    sync = []
    for variant in range(5):
        assert machine.call("ncFdFwSync", variant, OUTPUT, 8) == 8
        sync.append(machine.output(8).hex(" "))
    assert sync[4] == sync[0]
    result["firmwareSync"] = sync[:4]
    firmware = bytes(i % 256 for i in range(0x35001))
    machine.uc.mem_write(INPUT, firmware)
    assert machine.call("ncFdFwCondition", INPUT, len(firmware), 1, OUTPUT, len(firmware)) == len(firmware)
    conditioned = machine.output(len(firmware))
    expected = bytearray(firmware)
    for page in range((len(firmware) + 2047) // 2048):
        state = (page * 0x3e41 + 0x9bcf) & 65535
        for word in range(1024):
            offset = page * 2048 + word * 2
            if offset + 1 >= len(expected):
                break
            if 5 <= page <= 103 and word < 202:
                value = int.from_bytes(expected[offset:offset+2], "little") ^ state
                expected[offset:offset+2] = value.to_bytes(2, "little")
            state = (state * 0x549d + 0x6e45) & 65535
    assert conditioned == expected
    machine.uc.mem_write(INPUT, conditioned)
    machine.call("ncFdFwCondition", INPUT, len(firmware), 1, OUTPUT, len(firmware))
    assert machine.output(len(firmware)) == firmware
    result["checks"]["firmwareConditionBytes"] = len(firmware)
    official = (ROOT / "reference/decompiled/official/src/MotorNet6/MotorNet6/ParaPage.cs").read_text()
    table = re.search(r"FlashReadAddr = new int\[55\]\s*\{([^}]+)\}", official).group(1)
    official_map = [int(value) for value in re.findall(r"\d+", table)]
    native_map = list(machine.uc.mem_read(0x760b, 55))
    assert native_map == official_map
    result["checks"]["officialRxMappingEntries"] = 55
    result["rxIndexToLogicalId"] = native_map
    assert machine.call("ncCreateSession", 1) == 0

    def receive(index, payload):
        body = bytes([0xaa, 0x80 | index]) + payload
        assert len(body) == 14
        packet = body + checksum(body).to_bytes(2, "big")
        machine.uc.mem_write(INPUT, packet)
        assert machine.call("ncFdHandleNotification", 0, INPUT, 16) == 1
        damaged = bytearray(packet)
        damaged[-1] ^= 1
        machine.uc.mem_write(INPUT, bytes(damaged))
        assert machine.call("ncFdHandleNotification", 0, INPUT, 16) == 0

    # id 232: signed bus current, voltage, raw throttle; id 244: motor temp/SOC.
    payload = bytearray(12)
    struct.pack_into("<H", payload, 0, 487)
    struct.pack_into("<h", payload, 4, -100)
    struct.pack_into("<H", payload, 10, 192)
    receive(1, bytes(payload))
    payload = bytearray(12)
    struct.pack_into("<h", payload, 0, -7)
    payload[3] = 80
    receive(53, bytes(payload))
    assert machine.call("ncFdGetTelemetry", 0, OUTPUT, 15) == 15
    telemetry = list(struct.unpack("<15f", machine.output(60)))
    assert abs(telemetry[2] - 48.7) < 0.001
    assert telemetry[3] == -25
    assert abs(telemetry[4] + 1217.5) < 0.01
    assert telemetry[7] == -7
    assert telemetry[9] == 50
    result["telemetryExample"] = telemetry
    # id 24: max-line-current at byte offset 4 in the full frame, raw / 4 A.
    payload = bytearray(12)
    struct.pack_into("<H", payload, 2, 400)
    receive(10, bytes(payload))
    assert machine.call("ncFdGetConfig", 0, OUTPUT, 206) == 206
    config = struct.unpack("<206i", machine.output(824))
    assert config[5] == 1000  # JNI/API fixed point; Java converts / 10 -> 100 A.
    result["checks"]["nativeRxAndBadChecksumPairs"] = 3
    result["checks"]["maxLineCurrentRaw400Amps"] = config[5] / 10
    for index in range(55):
        receive(index, bytes(12))
    result["checks"]["allMappedRxAndBadChecksumPairs"] = 55
    receive(19, struct.pack("<6H", 1000, 1001, 1002, 1003, 1004, 1005))
    assert machine.call("ncFdGetRawConfigWords", 0, OUTPUT, 256) == 256
    raw_words = struct.unpack("<256i", machine.output(1024))
    assert raw_words[99:105] == (1000, 1001, 1002, 1003, 1004, 1005)
    assert raw_words[54] != raw_words[99]
    result["checks"]["rawWordsUseLogicalAddressesNotHebOffsets"] = True
    body = bytes([0xaa, 0x1f]) + bytes(12)
    machine.uc.mem_write(INPUT, body + sum(body).to_bytes(2, "big"))
    assert machine.call("ncFdHandleNotification", 0, INPUT, 16) == 1
    assert machine.call("ncFdGetProtocolSeen", 0) == 3
    machine.call("ncFdResetProtocolSeen", 0)
    assert machine.call("ncFdGetProtocolSeen", 0) == 0
    result["checks"]["protocolSeenMask"] = True
    for password in (b"", b"synthetic", b"abcdefghijklmnop"):
        machine.uc.mem_write(INPUT, password + b"\0")
        assert machine.call("ncFdBuildPasswordData", INPUT, OUTPUT) == 14
        expected = bytes([(0xb0 + len(password)) & 255]) + password[:13]
        expected = expected.ljust(14, b"\0")
        assert machine.output(14) == expected
    result["checks"]["syntheticPasswordVectors"] = 3
    for address, first, second in ((0, 0, 0), (3, 1000, 2000), (255, 65535, 65535)):
        assert machine.call("ncFdBuildRemoteDrive", address, first, second, OUTPUT) == 17
        body = bytes([0xaa, 0xfc, address, address]) + struct.pack("<HH", first, second) + bytes(7)
        assert machine.output(17) == body + checksum(body).to_bytes(2, "big")
    result["checks"]["remoteDriveVectorsOfflineOnly"] = 3
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", type=Path, default=LIBRARY)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = json.dumps(verify(args.library), indent=2) + "\n"
    if args.output:
        args.output.write_text(report)
    print(report, end="")
