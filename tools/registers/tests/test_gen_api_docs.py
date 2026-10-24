import json
from pathlib import Path

from gen_api_docs import render_all


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def test_render_all_includes_commands_with_safety_payload_and_evidence(tmp_path):
    write_json(
        tmp_path / "protocol/api/index/gdriver.index.json",
        [
            {
                "id": "gdriver.command_parser.auto_learn_start",
                "kind": "command_parser",
                "source": {"path": "reference/decompiled/gdriver/decompiled.js", "line": 42},
            }
        ],
    )
    write_json(tmp_path / "protocol/api/index/official.index.json", [])
    write_json(tmp_path / "protocol/api/index/worthless.index.json", [])
    write_json(
        tmp_path / "protocol/api/ledger/commands.json",
        [
            {
                "id": "fardriver.command.auto_learn_start",
                "type": "command",
                "protocolFamily": "fardriver",
                "name": "Auto-learn start",
                "safety": "motion_or_autolearn",
                "confidence": "high",
                "implementationStatus": "do_not_implement",
                "address": 160,
                "payload": [136, 2],
                "evidence": ["gdriver.command_parser.auto_learn_start"],
                "notes": "Do not expose as a web-app action.",
            }
        ],
    )
    for name in ("app-options", "file-formats", "safety", "transports"):
        write_json(tmp_path / f"protocol/api/ledger/{name}.json", [])

    docs = render_all(tmp_path)

    commands = docs["commands.md"]
    assert "Auto-learn start" in commands
    assert "motion_or_autolearn" in commands
    assert "`[136, 2]`" in commands
    assert "gdriver.command_parser.auto_learn_start" in commands
    assert "reference/decompiled/gdriver/decompiled.js:42" in commands
