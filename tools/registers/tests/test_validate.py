import json
from pathlib import Path

import pytest

from validate import validate_file

ROOT = Path(__file__).resolve().parents[3]
REG_SCHEMA = ROOT / "protocol/schema/register.schema.json"
TEL_SCHEMA = ROOT / "protocol/schema/telemetry.schema.json"

GOOD_REG = {
    "addr": 43, "key": "phase_current_limit", "name": "Phase current limit",
    "type": "u16", "scale": 1, "unit": "A", "min": 0, "max": 600, "access": "rw",
    "group": "motor", "enum": None,
    "explain": "Peak current the controller will push through the motor windings.",
    "confidence": "medium", "source": ["official:MotorNet6/Models/Params.cs#L12"],
}

def write(tmp_path: Path, entries) -> Path:
    p = tmp_path / "x.json"
    p.write_text(json.dumps(entries))
    return p

def test_valid_register_passes(tmp_path):
    assert validate_file(write(tmp_path, [GOOD_REG]), REG_SCHEMA) == []

def test_missing_field_fails(tmp_path):
    bad = {k: v for k, v in GOOD_REG.items() if k != "explain"}
    errs = validate_file(write(tmp_path, [bad]), REG_SCHEMA)
    assert errs and "explain" in errs[0]

def test_duplicate_addr_fails(tmp_path):
    other = dict(GOOD_REG, key="other_key")
    errs = validate_file(write(tmp_path, [GOOD_REG, other]), REG_SCHEMA)
    assert any("duplicate addr 43" in e for e in errs)

def test_duplicate_key_fails(tmp_path):
    other = dict(GOOD_REG, addr=44)
    errs = validate_file(write(tmp_path, [GOOD_REG, other]), REG_SCHEMA)
    assert any("duplicate key phase_current_limit" in e for e in errs)

def test_bad_source_prefix_fails(tmp_path):
    bad = dict(GOOD_REG, source=["somewhere.cs"])
    errs = validate_file(write(tmp_path, [bad]), REG_SCHEMA)
    assert errs

def test_rx_frame_and_offset_pass(tmp_path):
    good = dict(GOOD_REG, rx_frame="0x86", rx_offset=10)
    assert validate_file(write(tmp_path, [good]), REG_SCHEMA) == []

def test_bad_rx_frame_pattern_fails(tmp_path):
    bad = dict(GOOD_REG, rx_frame="0x1", rx_offset=0)
    errs = validate_file(write(tmp_path, [bad]), REG_SCHEMA)
    assert errs and any("rx_frame" in e for e in errs)

def test_telemetry_entry(tmp_path):
    tel = {
        "frame": "0xE2", "offset": 4, "key": "bus_voltage", "name": "Bus voltage",
        "type": "u16", "scale": 0.1, "unit": "V", "group": "power", "enum": None,
        "explain": "Battery pack voltage as measured at the controller's DC input.",
        "confidence": "low", "source": ["worthless:jadx/sources/a/b.java#L1"],
    }
    assert validate_file(write(tmp_path, [tel]), TEL_SCHEMA) == []

def test_repo_files_validate():
    assert validate_file(ROOT / "protocol/registers.json", REG_SCHEMA) == []
    assert validate_file(ROOT / "protocol/telemetry.json", TEL_SCHEMA) == []
