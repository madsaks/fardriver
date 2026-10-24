#!/usr/bin/env python3
"""Generate machine-readable evidence indexes from FarDriver decompiled apps."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
INDEX_DIR = ROOT / "protocol/api/index"


METHOD_RE = re.compile(
    r"\b(?:private|public|protected|internal)\s+"
    r"(?:async\s+)?(?:static\s+)?(?:void|[\w<>,\[\]?]+)\s+"
    r"(?P<name>[A-Za-z_]\w*)\s*\("
)
WRITEADDR_RE = re.compile(r"\bWriteAddr\s*\(\s*(?P<buffer>\w+)\s*,\s*(?P<address>\d+)\s*,\s*(?P<count>\d+)\s*\)")
ASSIGN_RE = re.compile(r"\b(?P<buffer>\w+)\s*\[\s*(?P<index>\d+)\s*\]\s*=\s*(?P<value>\d+)\s*;")
FD_WRITE_RE = re.compile(
    r"fdBuildWritePacket\s*\(\s*(?P<address>\d+)\s*,\s*(?P<payload>new\s+byte\s*\[\]\s*\{[^}]*\})"
)
FD_READ_RE = re.compile(r"fdBuildReadPacket\s*\(\s*(?P<address>\d+)\s*\)")
NATIVE_RE = re.compile(r"\bnative\s+(?P<return>[\w\[\]]+)\s+(?P<name>fd\w+)\s*\(")
STRING_RE = re.compile(r'"([^"]{3,160})"')


def parse_java_byte_array(expr: str) -> list[int | str]:
    """Parse simple Jadx byte-array literals while preserving dynamic values."""

    match = re.search(r"\{(?P<body>.*)\}", expr)
    body = match.group("body") if match else expr
    values: list[int | str] = []
    for token in body.split(","):
        token = token.strip()
        if not token:
            continue
        if re.fullmatch(r"-?\d+", token):
            values.append(int(token))
        else:
            values.append(token)
    return values


def _source(path: Path, line: int) -> dict[str, Any]:
    return {"path": path.as_posix(), "line": line}


def _quoted_labels(lines: list[str]) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for line in lines:
        for value in STRING_RE.findall(line):
            if value not in seen:
                labels.append(value)
                seen.add(value)
    return labels


def _payload_assignments(lines: list[str], buffer: str) -> list[int]:
    assignments: dict[int, int] = {}
    for line in lines:
        match = ASSIGN_RE.search(line)
        if not match or match.group("buffer") != buffer:
            continue
        index = int(match.group("index"))
        if index >= 4:
            assignments[index] = int(match.group("value"))
    return [assignments[index] for index in sorted(assignments)]


def scan_official_file(path: Path, text: str, line_offset: int = 1) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    lines = text.splitlines()
    current_method = "<module>"
    method_start = line_offset
    emitted_method_exports: set[str] = set()

    for idx, line in enumerate(lines):
        number = line_offset + idx
        method_match = METHOD_RE.search(line)
        if method_match:
            current_method = method_match.group("name")
            method_start = number
            if current_method == "OnExportClicked":
                record_id = f"official.{path.stem}.{current_method}.{method_start}"
                if record_id not in emitted_method_exports:
                    records.append(
                        {
                            "id": record_id,
                            "app": "official",
                            "kind": "file_export",
                            "operation": "heb_export",
                            "symbol": current_method,
                            "source": _source(path, method_start),
                            "confidence": "mechanical",
                        }
                    )
                    emitted_method_exports.add(record_id)

        if "commUUID" in line and ("65516" in line or "0xffec" in line.lower()):
            records.append(
                {
                    "id": f"official.{path.stem}.ble_uuid.{number}",
                    "app": "official",
                    "kind": "bluetooth",
                    "operation": "ble_uuid",
                    "symbol": "commUUID",
                    "source": _source(path, number),
                    "uuidHint": "0000ffec-0000-1000-8000-00805f9b34fb",
                    "confidence": "mechanical",
                }
            )

        if "commHeadUUID" in line and ("65504" in line or "0xffe0" in line.lower()):
            records.append(
                {
                    "id": f"official.{path.stem}.ble_service_uuid.{number}",
                    "app": "official",
                    "kind": "bluetooth",
                    "operation": "ble_service_uuid",
                    "symbol": "commHeadUUID",
                    "source": _source(path, number),
                    "uuidHint": "0000ffe0-0000-1000-8000-00805f9b34fb",
                    "confidence": "mechanical",
                }
            )

        if current_method == "OnExportClicked" and "File.WriteAllBytes" in line:
            records.append(
                {
                    "id": f"official.{path.stem}.{current_method}.{number}",
                    "app": "official",
                    "kind": "file_export",
                    "operation": "heb_export",
                    "symbol": current_method,
                    "source": _source(path, number),
                    "confidence": "mechanical",
                }
            )

        write_match = WRITEADDR_RE.search(line)
        if write_match:
            lookback = lines[max(0, idx - 12) : idx]
            buffer = write_match.group("buffer")
            records.append(
                {
                    "id": f"official.{path.stem}.{current_method}.{number}",
                    "app": "official",
                    "kind": "write_call",
                    "operation": "WriteAddr",
                    "symbol": current_method,
                    "source": _source(path, number),
                    "address": int(write_match.group("address")),
                    "payload": {
                        "buffer": buffer,
                        "count": int(write_match.group("count")),
                        "bytes": _payload_assignments(lookback, buffer),
                    },
                    "nearbyLabels": _quoted_labels(lookback),
                    "confidence": "mechanical",
                }
            )

    return records


def scan_worthless_file(path: Path, text: str, line_offset: int = 1) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for idx, line in enumerate(text.splitlines()):
        number = line_offset + idx
        native_match = NATIVE_RE.search(line)
        if native_match:
            records.append(
                {
                    "id": f"worthless.{path.stem}.{native_match.group('name')}.{number}",
                    "app": "worthless",
                    "kind": "native_api",
                    "operation": native_match.group("name"),
                    "source": _source(path, number),
                    "returnType": native_match.group("return"),
                    "confidence": "mechanical",
                }
            )

        write_match = FD_WRITE_RE.search(line)
        if write_match:
            records.append(
                {
                    "id": f"worthless.{path.stem}.fdBuildWritePacket.{number}",
                    "app": "worthless",
                    "kind": "write_call",
                    "operation": "fdBuildWritePacket",
                    "source": _source(path, number),
                    "address": int(write_match.group("address")),
                    "payload": {"bytes": parse_java_byte_array(write_match.group("payload"))},
                    "confidence": "mechanical",
                }
            )

        read_match = FD_READ_RE.search(line)
        if read_match:
            records.append(
                {
                    "id": f"worthless.{path.stem}.fdBuildReadPacket.{number}",
                    "app": "worthless",
                    "kind": "read_call",
                    "operation": "fdBuildReadPacket",
                    "source": _source(path, number),
                    "address": int(read_match.group("address")),
                    "confidence": "mechanical",
                }
            )

        if '".heb"' in line or ".heb" in line:
            records.append(
                {
                    "id": f"worthless.{path.stem}.heb_export.{number}",
                    "app": "worthless",
                    "kind": "file_export",
                    "operation": "heb_export",
                    "source": _source(path, number),
                    "confidence": "mechanical",
                }
            )
    return records


def scan_gdriver_file(path: Path, text: str, line_offset: int = 1) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    emitted: set[str] = set()
    known = {
        "auto_learn_start": [136, 2],
        "auto_learn_exit": [136, 3],
    }
    for idx, line in enumerate(text.splitlines()):
        number = line_offset + idx
        for command, payload in known.items():
            if command not in line or command in emitted or "kind" not in line:
                continue
            records.append(
                {
                    "id": f"gdriver.command_parser.{command}",
                    "app": "gdriver",
                    "kind": "command_parser",
                    "operation": "classify_command",
                    "source": _source(path, number),
                    "address": 160,
                    "payload": {"bytes": payload},
                    "confidence": "mechanical",
                }
            )
            emitted.add(command)
    return records


def scan_all(root: Path = ROOT) -> dict[str, list[dict[str, Any]]]:
    official: list[dict[str, Any]] = []
    for path in sorted((root / "reference/decompiled/official/src/MotorNet6/MotorNet6").glob("*.cs")):
        official.extend(scan_official_file(path.relative_to(root), path.read_text(errors="replace")))

    worthless: list[dict[str, Any]] = []
    for path in sorted((root / "reference/decompiled/worthless/jadx/sources").glob("**/*.java")):
        worthless.extend(scan_worthless_file(path.relative_to(root), path.read_text(errors="replace")))

    gdriver: list[dict[str, Any]] = []
    gdriver_path = root / "reference/decompiled/gdriver/decompiled.js"
    if gdriver_path.exists():
        gdriver.extend(scan_gdriver_file(gdriver_path.relative_to(root), gdriver_path.read_text(errors="replace")))

    return {
        "official": sorted(official, key=lambda record: record["id"]),
        "worthless": sorted(worthless, key=lambda record: record["id"]),
        "gdriver": sorted(gdriver, key=lambda record: record["id"]),
    }


def write_indexes(root: Path = ROOT) -> None:
    records_by_app = scan_all(root)
    index_dir = root / "protocol/api/index"
    index_dir.mkdir(parents=True, exist_ok=True)
    for app, records in records_by_app.items():
        (index_dir / f"{app}.index.json").write_text(json.dumps(records, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    write_indexes(args.root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
