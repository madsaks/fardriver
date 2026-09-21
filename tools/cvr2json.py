#!/usr/bin/env python3
"""Decode a Compose Multiplatform .cvr string table to JSON {key: value}."""
import base64, json, sys

def decode(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.rstrip("\n")
            if not line:
                continue
            if lineno == 1 and line.startswith("version:"):
                # header line, e.g. "version:0" — not a string entry
                continue
            parts = line.split("|", 2)
            if len(parts) != 3:
                raise SystemExit(f"{path}:{lineno}: unexpected line format: {line[:60]!r}")
            typ, key, b64 = parts
            if typ != "string":
                continue
            out[key] = base64.b64decode(b64).decode("utf-8")
    return out

if __name__ == "__main__":
    json.dump(decode(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
