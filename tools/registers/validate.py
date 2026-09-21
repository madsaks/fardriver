#!/usr/bin/env python3
"""Validate protocol/registers.json and protocol/telemetry.json.

Usage: uv run --project tools/registers tools/registers/validate.py
Exit 0 when valid; prints one error per line and exits 1 otherwise.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]


def validate_file(path: Path, schema_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text())
    entries = json.loads(path.read_text())
    errors: list[str] = []
    if not isinstance(entries, list):
        return [f"{path}: top level must be a list"]
    v = Draft202012Validator(schema)
    for i, entry in enumerate(entries):
        for err in sorted(v.iter_errors(entry), key=lambda e: list(e.path)):
            where = "/".join(str(p) for p in err.path) or "(entry)"
            errors.append(f"{path}[{i}] {where}: {err.message}")
    unique_field = "addr" if "addr" in schema["properties"] else None
    if unique_field:
        for val, n in Counter(e.get(unique_field) for e in entries if isinstance(e, dict)).items():
            if n > 1:
                errors.append(f"{path}: duplicate {unique_field} {val} ({n} entries)")
    for val, n in Counter(e.get("key") for e in entries if isinstance(e, dict)).items():
        if n > 1:
            errors.append(f"{path}: duplicate key {val} ({n} entries)")
    return errors


def main() -> int:
    errs = validate_file(ROOT / "protocol/registers.json", ROOT / "protocol/schema/register.schema.json")
    errs += validate_file(ROOT / "protocol/telemetry.json", ROOT / "protocol/schema/telemetry.schema.json")
    for e in errs:
        print(e)
    print("OK" if not errs else f"{len(errs)} error(s)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
