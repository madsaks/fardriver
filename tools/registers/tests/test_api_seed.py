import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def load(rel: str):
    return json.loads((ROOT / rel).read_text())


def test_seed_ledgers_exist_and_are_lists():
    for rel in [
        "protocol/api/index/official.index.json",
        "protocol/api/index/worthless.index.json",
        "protocol/api/index/gdriver.index.json",
        "protocol/api/ledger/commands.json",
        "protocol/api/ledger/app-options.json",
        "protocol/api/ledger/file-formats.json",
        "protocol/api/ledger/transports.json",
        "protocol/api/ledger/safety.json",
    ]:
        assert isinstance(load(rel), list), rel


def test_high_risk_seed_commands_are_present():
    commands = {entry["id"]: entry for entry in load("protocol/api/ledger/commands.json")}
    assert commands["fardriver.command.auto_learn_start"]["safety"] == "motion_or_autolearn"
    assert commands["fardriver.command.auto_learn_exit"]["safety"] == "motion_or_autolearn"
    assert commands["fardriver.command.restore_autolearn_defaults"]["safety"] == "destructive_config"
