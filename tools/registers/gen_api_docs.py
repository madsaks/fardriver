#!/usr/bin/env python3
"""Render FarDriver API ledger markdown from curated JSON and evidence indexes."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LEDGER_DIR = Path("protocol/api/ledger")
INDEX_DIR = Path("protocol/api/index")
OUTPUT_DIR = Path("protocol/api/generated")
LEDGER_FILES = {
    "commands": "commands.json",
    "file-formats": "file-formats.json",
    "transports": "transports.json",
    "app-options": "app-options.json",
    "safety": "safety.json",
}


def _load_list(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text())
    if not isinstance(value, list):
        raise ValueError(f"{path}: top level must be a list")
    return value


def _index_by_id(root: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    for path in sorted((root / INDEX_DIR).glob("*.index.json")):
        for record in _load_list(path):
            records[record["id"]] = record
    return records


def _ledger(root: Path, name: str) -> list[dict[str, Any]]:
    return _load_list(root / LEDGER_DIR / LEDGER_FILES[name])


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "`" + json.dumps(value) + "`"
    return str(value).replace("\n", " ")


def _evidence_text(entry: dict[str, Any], evidence_index: dict[str, dict[str, Any]]) -> str:
    chunks: list[str] = []
    for evidence_id in entry.get("evidence", []):
        record = evidence_index.get(evidence_id)
        if record and isinstance(record.get("source"), dict):
            source = record["source"]
            chunks.append(f"`{evidence_id}` ({source.get('path')}:{source.get('line')})")
        else:
            chunks.append(f"`{evidence_id}`")
    return "<br>".join(chunks)


def _table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return "No records.\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(cell.replace("|", "\\|") for cell in row) + " |")
    return "\n".join(lines) + "\n"


def _render_overview(root: Path, evidence_index: dict[str, dict[str, Any]]) -> str:
    ledger_counts = {name: len(_ledger(root, name)) for name in LEDGER_FILES}
    index_counts = Counter(record.get("app", "unknown") for record in evidence_index.values())
    lines = [
        "# FarDriver API Reference",
        "",
        "Generated from `protocol/api/ledger/*.json` and `protocol/api/index/*.index.json`.",
        "",
        "## Ledger Counts",
        "",
    ]
    lines.extend(f"- `{name}`: {count}" for name, count in sorted(ledger_counts.items()))
    lines.extend(["", "## Evidence Index Counts", ""])
    lines.extend(f"- `{name}`: {count}" for name, count in sorted(index_counts.items()))
    lines.append("")
    return "\n".join(lines)


def _render_commands(root: Path, evidence_index: dict[str, dict[str, Any]]) -> str:
    rows = []
    for entry in _ledger(root, "commands"):
        rows.append(
            [
                _fmt(entry.get("name")),
                _fmt(entry.get("address")),
                _fmt(entry.get("payload")),
                _fmt(entry.get("safety")),
                _fmt(entry.get("implementationStatus")),
                _evidence_text(entry, evidence_index),
                _fmt(entry.get("notes")),
            ]
        )
    return "# Commands\n\n" + _table(
        ["Name", "Address", "Payload", "Safety", "Status", "Evidence", "Notes"],
        rows,
    )


def _render_file_formats(root: Path, evidence_index: dict[str, dict[str, Any]]) -> str:
    rows = []
    for entry in _ledger(root, "file-formats"):
        conflicts = "; ".join(conflict.get("summary", "") for conflict in entry.get("conflicts", []))
        rows.append(
            [
                _fmt(entry.get("name")),
                _fmt(entry.get("fileFormat")),
                _fmt(entry.get("safety")),
                _fmt(entry.get("implementationStatus")),
                _evidence_text(entry, evidence_index),
                _fmt(conflicts or entry.get("notes")),
            ]
        )
    return "# File Formats\n\n" + _table(
        ["Name", "Format", "Safety", "Status", "Evidence", "Notes"],
        rows,
    )


def _render_transports(root: Path, evidence_index: dict[str, dict[str, Any]]) -> str:
    rows = []
    for entry in _ledger(root, "transports"):
        rows.append(
            [
                _fmt(entry.get("name")),
                _fmt(entry.get("transport")),
                _fmt(entry.get("safety")),
                _fmt(entry.get("implementationStatus")),
                _evidence_text(entry, evidence_index),
                _fmt(entry.get("notes")),
            ]
        )
    return "# Transports\n\n" + _table(
        ["Name", "Transport", "Safety", "Status", "Evidence", "Notes"],
        rows,
    )


def _render_generic(root: Path, name: str, title: str, evidence_index: dict[str, dict[str, Any]]) -> str:
    rows = []
    for entry in _ledger(root, name):
        rows.append(
            [
                _fmt(entry.get("name")),
                _fmt(entry.get("type")),
                _fmt(entry.get("safety")),
                _fmt(entry.get("implementationStatus")),
                _evidence_text(entry, evidence_index),
                _fmt(entry.get("notes")),
            ]
        )
    return f"# {title}\n\n" + _table(["Name", "Type", "Safety", "Status", "Evidence", "Notes"], rows)


def render_all(root: Path = ROOT) -> dict[str, str]:
    evidence_index = _index_by_id(root)
    return {
        "README.md": _render_overview(root, evidence_index),
        "commands.md": _render_commands(root, evidence_index),
        "file-formats.md": _render_file_formats(root, evidence_index),
        "transports.md": _render_transports(root, evidence_index),
        "app-options.md": _render_generic(root, "app-options", "App Options", evidence_index),
        "safety.md": _render_generic(root, "safety", "Safety Rules", evidence_index),
    }


def write_docs(root: Path = ROOT) -> None:
    output = root / OUTPUT_DIR
    output.mkdir(parents=True, exist_ok=True)
    for name, content in render_all(root).items():
        (output / name).write_text(content)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    write_docs(args.root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
