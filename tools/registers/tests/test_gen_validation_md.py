from gen_validation_md import render


def test_render_has_one_row_per_entry():
    regs = [
        {
            "addr": 43,
            "key": "phase_current_limit",
            "name": "Phase current limit",
            "confidence": "medium",
        }
    ]
    tel = [
        {
            "frame": "0xE2",
            "offset": 4,
            "key": "bus_voltage",
            "name": "Bus voltage",
            "confidence": "low",
        }
    ]
    md = render(regs, tel)
    assert "| 0x2B | phase_current_limit | Phase current limit | medium |  |  |" in md
    assert "| 0xE2+4 | bus_voltage | Bus voltage | low |  |  |" in md
    assert md.startswith("# Validation checklist")
