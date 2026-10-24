import json
from pathlib import Path

from validate_api import validate_api


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def minimal_root(tmp_path: Path) -> Path:
    source = tmp_path / "reference/decompiled/app/File.cs"
    source.parent.mkdir(parents=True)
    source.write_text("WriteAddr(buf, 160, 2);\n")
    write_json(
        tmp_path / "protocol/api/index/official.index.json",
        [
            {
                "id": "official.File.Send.1",
                "app": "official",
                "kind": "write_call",
                "operation": "WriteAddr",
                "source": {"path": "reference/decompiled/app/File.cs", "line": 1},
                "address": 160,
                "payload": {"bytes": [136, 11]},
                "confidence": "mechanical",
            }
        ],
    )
    write_json(tmp_path / "protocol/api/index/worthless.index.json", [])
    write_json(tmp_path / "protocol/api/index/gdriver.index.json", [])
    write_json(
        tmp_path / "protocol/api/ledger/commands.json",
        [
            {
                "id": "fardriver.command.restore_autolearn_defaults",
                "type": "command",
                "protocolFamily": "fardriver",
                "name": "Restore auto-learn default config",
                "safety": "destructive_config",
                "confidence": "high",
                "implementationStatus": "documented",
                "payload": [136, 11],
                "evidence": ["official.File.Send.1"],
            }
        ],
    )
    write_json(tmp_path / "protocol/api/ledger/file-formats.json", [])
    write_json(tmp_path / "protocol/api/ledger/transports.json", [])
    write_json(tmp_path / "protocol/api/ledger/app-options.json", [])
    write_json(tmp_path / "protocol/api/ledger/safety.json", [])
    return tmp_path


def test_valid_api_tree_passes(tmp_path):
    root = minimal_root(tmp_path)
    assert validate_api(root) == []


def test_duplicate_index_ids_fail(tmp_path):
    root = minimal_root(tmp_path)
    path = root / "protocol/api/index/official.index.json"
    records = json.loads(path.read_text())
    write_json(path, records + records)
    assert any("duplicate index id" in error for error in validate_api(root))


def test_source_line_beyond_end_of_file_fails(tmp_path):
    root = minimal_root(tmp_path)
    path = root / "protocol/api/index/official.index.json"
    records = json.loads(path.read_text())
    records[0]["source"]["line"] = 99
    write_json(path, records)
    assert any("source.line exceeds" in error for error in validate_api(root))


def test_missing_evidence_id_fails(tmp_path):
    root = minimal_root(tmp_path)
    commands = json.loads((root / "protocol/api/ledger/commands.json").read_text())
    commands[0]["evidence"] = ["official.File.Missing.9"]
    write_json(root / "protocol/api/ledger/commands.json", commands)

    assert any("unknown evidence official.File.Missing.9" in error for error in validate_api(root))


def test_missing_required_ledger_field_fails(tmp_path):
    root = minimal_root(tmp_path)
    commands = json.loads((root / "protocol/api/ledger/commands.json").read_text())
    del commands[0]["implementationStatus"]
    write_json(root / "protocol/api/ledger/commands.json", commands)

    assert any("missing implementationStatus" in error for error in validate_api(root))


def test_dangerous_command_cannot_be_safe_read(tmp_path):
    root = minimal_root(tmp_path)
    commands = json.loads((root / "protocol/api/ledger/commands.json").read_text())
    commands[0]["safety"] = "safe_read"
    write_json(root / "protocol/api/ledger/commands.json", commands)

    assert any("dangerous command" in error for error in validate_api(root))


def test_payload_bytes_must_be_unsigned(tmp_path):
    root = minimal_root(tmp_path)
    commands = json.loads((root / "protocol/api/ledger/commands.json").read_text())
    commands[0]["payload"] = [136, 999]
    write_json(root / "protocol/api/ledger/commands.json", commands)

    assert any("payload byte" in error for error in validate_api(root))
