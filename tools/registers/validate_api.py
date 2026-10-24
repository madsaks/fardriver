#!/usr/bin/env python3
"""Validate the FarDriver protocol API index and curated ledger."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
INDEX_GLOB = "protocol/api/index/*.index.json"
LEDGER_GLOB = "protocol/api/ledger/*.json"
REQUIRED_LEDGER_FIELDS = {
    "id",
    "type",
    "protocolFamily",
    "name",
    "safety",
    "confidence",
    "implementationStatus",
    "evidence",
}
DANGEROUS_TERMS = (
    "auto",
    "learn",
    "reset",
    "restore",
    "firmware",
    "password",
    "security",
    "bind",
    "unlock",
)
SAFE_ONLY_CLASSES = {"passive_observe", "safe_read"}


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def _list_json(path: Path, errors: list[str]) -> list[dict[str, Any]]:
    try:
        value = _load_json(path)
    except json.JSONDecodeError as exc:
        errors.append(f"{path}: invalid JSON: {exc}")
        return []
    if not isinstance(value, list):
        errors.append(f"{path}: top level must be a list")
        return []
    bad = [i for i, item in enumerate(value) if not isinstance(item, dict)]
    for i in bad:
        errors.append(f"{path}[{i}]: entry must be an object")
    return [item for item in value if isinstance(item, dict)]


def _validate_index_records(root: Path, errors: list[str]) -> set[str]:
    evidence_ids: set[str] = set()
    all_ids: list[str] = []
    line_counts: dict[Path, int] = {}
    index_paths = sorted(root.glob(INDEX_GLOB))
    if not index_paths:
        errors.append(f"{root / 'protocol/api/index'}: no *.index.json files")
        return evidence_ids

    for path in index_paths:
        records = _list_json(path, errors)
        for index, record in enumerate(records):
            record_id = record.get("id")
            if not isinstance(record_id, str) or not record_id:
                errors.append(f"{path}[{index}]: missing id")
                continue
            evidence_ids.add(record_id)
            all_ids.append(record_id)
            source = record.get("source")
            if not isinstance(source, dict):
                errors.append(f"{path}[{index}] {record_id}: missing source object")
                continue
            rel_path = source.get("path")
            line = source.get("line")
            if not isinstance(rel_path, str) or not rel_path:
                errors.append(f"{path}[{index}] {record_id}: missing source.path")
            elif not (root / rel_path).exists():
                errors.append(f"{path}[{index}] {record_id}: source path does not exist: {rel_path}")
            if not isinstance(line, int) or line < 1:
                errors.append(f"{path}[{index}] {record_id}: source.line must be a positive integer")
            elif isinstance(rel_path, str) and (root / rel_path).is_file():
                source_path = root / rel_path
                if source_path not in line_counts:
                    with source_path.open(errors="replace") as stream:
                        line_counts[source_path] = sum(1 for _ in stream)
                if line > line_counts[source_path]:
                    errors.append(f"{path}[{index}] {record_id}: source.line exceeds file length")

    duplicates = [value for value, count in Counter(all_ids).items() if count > 1]
    for duplicate in duplicates:
        errors.append(f"{root / 'protocol/api/index'}: duplicate index id {duplicate}")
    return evidence_ids


def _validate_payload(path: Path, index: int, entry: dict[str, Any], errors: list[str]) -> None:
    payload = entry.get("payload")
    if payload is None:
        return
    if not isinstance(payload, list):
        errors.append(f"{path}[{index}] {entry.get('id')}: payload must be a list")
        return
    for offset, value in enumerate(payload):
        if not isinstance(value, int) or value < 0 or value > 255:
            errors.append(f"{path}[{index}] {entry.get('id')}: payload byte {offset} must be 0..255")


def _validate_dangerous_safety(path: Path, index: int, entry: dict[str, Any], errors: list[str]) -> None:
    if entry.get("type") != "command" or entry.get("safety") not in SAFE_ONLY_CLASSES:
        return
    haystack = " ".join(
        str(entry.get(field, "")).lower()
        for field in ("id", "name", "operation", "notes", "implementationStatus")
    )
    if any(term in haystack for term in DANGEROUS_TERMS):
        errors.append(f"{path}[{index}] {entry.get('id')}: dangerous command cannot be {entry.get('safety')}")


def _validate_ledger(root: Path, evidence_ids: set[str], errors: list[str]) -> None:
    ledger_paths = sorted(root.glob(LEDGER_GLOB))
    if not ledger_paths:
        errors.append(f"{root / 'protocol/api/ledger'}: no ledger JSON files")
        return

    all_ids: list[str] = []
    for path in ledger_paths:
        entries = _list_json(path, errors)
        for index, entry in enumerate(entries):
            entry_id = entry.get("id")
            if isinstance(entry_id, str):
                all_ids.append(entry_id)
            for field in sorted(REQUIRED_LEDGER_FIELDS):
                if field not in entry:
                    errors.append(f"{path}[{index}] {entry_id}: missing {field}")
            evidence = entry.get("evidence", [])
            if not isinstance(evidence, list):
                errors.append(f"{path}[{index}] {entry_id}: evidence must be a list")
            else:
                for evidence_id in evidence:
                    if evidence_id not in evidence_ids:
                        errors.append(f"{path}[{index}] {entry_id}: unknown evidence {evidence_id}")
            _validate_payload(path, index, entry, errors)
            _validate_dangerous_safety(path, index, entry, errors)

    for entry_id, count in Counter(all_ids).items():
        if count > 1:
            errors.append(f"{root / 'protocol/api/ledger'}: duplicate ledger id {entry_id}")


def validate_api(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    evidence_ids = _validate_index_records(root, errors)
    _validate_ledger(root, evidence_ids, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    errors = validate_api(args.root)
    for error in errors:
        print(error)
    print("OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
