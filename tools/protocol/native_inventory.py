# /// script
# requires-python = ">=3.11"
# dependencies = ["pyelftools==0.33"]
# ///
"""Extract local reference library and publish metadata only, never app code.

uv run tools/protocol/native_inventory.py --extract
uv run tools/protocol/native_inventory.py --index
"""
import argparse
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

from elftools.elf.elffile import ELFFile

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "reference/decompiled/worthless/native"
LIBRARY = NATIVE / "arm64-v8a/libfd_protocol.so"


def extract():
    archives = sorted((ROOT / "reference/apps").glob("*Worthless*.xapk"))
    if len(archives) != 1:
        raise ValueError("Expected one Worthless XAPK in reference/apps")
    with zipfile.ZipFile(archives[0]) as outer:
        with zipfile.ZipFile(io.BytesIO(outer.read("config.arm64_v8a.apk"))) as inner:
            data = inner.read("lib/arm64-v8a/libfd_protocol.so")
    LIBRARY.parent.mkdir(parents=True, exist_ok=True)
    LIBRARY.write_bytes(data)
    print(f"Extracted {len(data)} bytes; SHA-256 {hashlib.sha256(data).hexdigest()}")


def inventory():
    java = ROOT / "reference/decompiled/worthless/jadx/sources/com/rcplusplus/fdandroid/protocol/NativeProtocol.java"
    declarations = {}
    for number, line in enumerate(java.read_text().splitlines(), 1):
        match = re.search(r"native (\S+) (\w+)\(([^)]*)\)", line)
        if match:
            declarations[match[2]] = {"returnType": match[1], "arguments": match[3], "javaLine": number}
    with LIBRARY.open("rb") as stream:
        elf = ELFFile(stream)
        symbols = sorted((s for s in elf.get_section_by_name(".dynsym").iter_symbols()
                          if s["st_value"] and s["st_info"]["type"] == "STT_FUNC" and
                          (s.name.startswith("nc") or s.name.startswith("Java_com_rcplusplus"))),
                         key=lambda s: s["st_value"])
        functions = []
        evidence = []
        for symbol in symbols:
            name, address = symbol.name, symbol["st_value"]
            record = {"symbol": name, "elfAddress": f"0x{address:x}", "sizeBytes": symbol["st_size"]}
            if name.startswith("Java_"):
                method = name.rsplit("_", 1)[-1]
                record.update(declarations.get(method, {}))
            functions.append(record)
            # Ghidra 11.0.3's default import base for this ELF is 0x100000.
            path = NATIVE / "export" / f"{address + 0x100000:08x}_{name}.c"
            if not path.exists():
                raise ValueError(f"Decompile first: missing {path}")
            evidence.append({"id": f"worthless.native.{name}", "app": "worthless-native",
                             "kind": "native_api", "operation": name,
                             "source": {"path": path.relative_to(ROOT).as_posix(), "line": 1},
                             "elfAddress": f"0x{address:x}", "confidence": "mechanical"})
    for address, name in [(0xdcfc, "rx_dispatch"), (0x155bc, "rx_crc_check"), (0x15744, "decode_fields"), (0xb55c, "telemetry_array"), (0xb668, "config_array")]:
        path = NATIVE / "export" / f"{address + 0x100000:08x}_FUN_{address + 0x100000:08x}.c"
        if not path.exists():
            raise ValueError(f"Missing decompiled helper: {path}")
        evidence.append({"id": f"worthless.native.{name}", "app": "worthless-native", "kind": "parser",
                         "source": {"path": path.relative_to(ROOT).as_posix(), "line": 1},
                         "elfAddress": f"0x{address:x}", "confidence": "mechanical"})
    metadata = {"app": "Worthless Controls 5.1.16", "architecture": "AArch64 little-endian ELF64",
                "library": "libfd_protocol.so", "sizeBytes": LIBRARY.stat().st_size,
                "sha256": hashlib.sha256(LIBRARY.read_bytes()).hexdigest(),
                "sourceArchiveMember": "config.arm64_v8a.apk!lib/arm64-v8a/libfd_protocol.so",
                "ghidraVersion": "11.0.3", "ghidraImageBase": "0x100000",
                "javaDeclarations": len(declarations), "functions": functions}
    output = ROOT / "protocol/api/native"
    output.mkdir(parents=True, exist_ok=True)
    (output / "worthless-arm64.json").write_text(json.dumps(metadata, indent=2) + "\n")
    fields = []
    for name in ("FardriverConfig", "FardriverTelemetry", "FdPreset"):
        path = java.parent.parent / "data" / f"{name}.java"
        for number, line in enumerate(path.read_text().splitlines(), 1):
            match = re.search(r"private (?:final )?(.+?) (\w+);", line)
            if match:
                fields.append({"model": name, "field": match[2], "managedType": match[1],
                               "source": {"path": path.relative_to(ROOT).as_posix(), "line": number},
                               "confidence": "mechanical"})
    (output / "worthless-managed-fields.json").write_text(json.dumps(fields, indent=2) + "\n")
    (ROOT / "protocol/api/index/worthless-native.index.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(f"Indexed {len(functions)} native exports and {len(declarations)} Java declarations")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extract", action="store_true")
    parser.add_argument("--index", action="store_true")
    args = parser.parse_args()
    if not args.extract and not args.index:
        parser.error("Choose --extract and/or --index")
    if args.extract:
        extract()
    if args.index:
        inventory()
