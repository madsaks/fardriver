# FarDriver API Index Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FarDriver decompile index, evidence ledger, validators, and generated API docs.

**Architecture:** Add machine-readable API data under `protocol/api/`, generated from decompiled-source scans and curated ledger JSON. Keep mechanical index records separate from semantic ledger records; validation connects ledger evidence to index records and docs generation renders Markdown from the ledger.

**Tech Stack:** Python 3.11+, `uv`, `pytest`, repo-local JSON/Markdown files.

**Spec:** `docs/superpowers/specs/2026-09-22-fardriver-decompile-index-evidence-ledger-design.md`

## Global Constraints

- FarDriver only; no Segway protocol records in this phase.
- No live Bluetooth probing as part of indexing.
- No controller writes in discovery tooling.
- Machine JSON is the source of truth; Markdown is generated.
- `protocol/registers.json` remains the register source of truth; ledger records link to register keys or addresses.
- Dangerous commands must not be classified as `passive_observe` or `safe_read`.
- Do not expose a web-app action merely because a command is documented.

---

### Task 1: API Directory And Seed Ledger

**Files:**
- Create: `protocol/api/index/official.index.json`
- Create: `protocol/api/index/worthless.index.json`
- Create: `protocol/api/index/gdriver.index.json`
- Create: `protocol/api/ledger/commands.json`
- Create: `protocol/api/ledger/app-options.json`
- Create: `protocol/api/ledger/file-formats.json`
- Create: `protocol/api/ledger/transports.json`
- Create: `protocol/api/ledger/safety.json`
- Test: `tools/registers/tests/test_api_seed.py`

**Interfaces:**
- Produces: JSON files consumed by `tools/registers/validate_api.py` and `tools/registers/gen_api_docs.py`.

- [ ] **Step 1: Write the failing test**

Create `tools/registers/tests/test_api_seed.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_api_seed.py -q`

Expected: FAIL because the API JSON files do not exist yet.

- [ ] **Step 3: Create seed JSON files**

Create the index files as empty lists. Create ledger files with initial high-risk records:

```json
[
  {
    "id": "fardriver.command.auto_learn_start",
    "type": "command",
    "protocolFamily": "fardriver",
    "name": "Auto-learn start",
    "transport": "ble",
    "operation": "WriteAddr",
    "address": 160,
    "payload": [136, 2],
    "safety": "motion_or_autolearn",
    "confidence": "high",
    "implementationStatus": "do_not_implement",
    "webAppPolicy": "display_only",
    "evidence": ["gdriver.command_parser.auto_learn_start"],
    "notes": "GDriver classifies address 160 value 0x0288 as auto_learn_start."
  },
  {
    "id": "fardriver.command.auto_learn_exit",
    "type": "command",
    "protocolFamily": "fardriver",
    "name": "Auto-learn exit",
    "transport": "ble",
    "operation": "WriteAddr",
    "address": 160,
    "payload": [136, 3],
    "safety": "motion_or_autolearn",
    "confidence": "high",
    "implementationStatus": "do_not_implement",
    "webAppPolicy": "display_only",
    "evidence": ["gdriver.command_parser.auto_learn_exit"],
    "notes": "GDriver classifies address 160 value 0x0388 as auto_learn_exit."
  },
  {
    "id": "fardriver.command.restore_autolearn_defaults",
    "type": "command",
    "protocolFamily": "fardriver",
    "name": "Restore auto-learn default config",
    "transport": "ble",
    "operation": "WriteAddr",
    "address": 160,
    "payload": [136, 11],
    "safety": "destructive_config",
    "confidence": "high",
    "implementationStatus": "documented",
    "webAppPolicy": "display_only",
    "evidence": [
      "official.ProControlPage.OnButtonResetClicked.9137",
      "official.ParaPage.OnButtonResetClicked.3525"
    ],
    "notes": "Preset/config restore, not the same as live auto-learn start."
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_api_seed.py -q`

Expected: PASS.

### Task 2: Decompile Indexer

**Files:**
- Create: `tools/registers/gen_decompile_index.py`
- Test: `tools/registers/tests/test_gen_decompile_index.py`
- Modify: `protocol/api/index/official.index.json`
- Modify: `protocol/api/index/worthless.index.json`
- Modify: `protocol/api/index/gdriver.index.json`

**Interfaces:**
- Consumes: decompiled source files under `reference/decompiled/`.
- Produces: `scan_all(root: Path) -> dict[str, list[dict]]` and JSON index files.

- [ ] **Step 1: Write failing tests**

Create `tools/registers/tests/test_gen_decompile_index.py` with fixture strings for official, Worthless, and GDriver extraction. Tests assert that `WriteAddr`, `fdBuildWritePacket`, and GDriver parser constants produce index records with stable ids.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_gen_decompile_index.py -q`

Expected: FAIL because `gen_decompile_index.py` does not exist.

- [ ] **Step 3: Implement indexer**

Implement:

```python
def scan_official_file(path: Path, text: str) -> list[dict]: ...
def scan_worthless_file(path: Path, text: str) -> list[dict]: ...
def scan_gdriver_file(path: Path, text: str) -> list[dict]: ...
def scan_all(root: Path) -> dict[str, list[dict]]: ...
```

Use regexes for:

- `WriteAddr(..., <addr>, <len>)`.
- nearby `SendRS232L[4] = 136` and `SendRS232L[5] = <n>`.
- `fdBuildWritePacket(<addr>, new byte[]{...})`.
- `fdBuildReadPacket(<addr>)`.
- GDriver command parser constants around `auto_learn_start` and `auto_learn_exit`.

- [ ] **Step 4: Run tests**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_gen_decompile_index.py -q`

Expected: PASS.

- [ ] **Step 5: Generate indexes**

Run: `uv run --project tools/registers tools/registers/gen_decompile_index.py`

Expected: writes three index JSON files.

### Task 3: API Validator

**Files:**
- Create: `tools/registers/validate_api.py`
- Test: `tools/registers/tests/test_validate_api.py`

**Interfaces:**
- Consumes: `protocol/api/index/*.json` and `protocol/api/ledger/*.json`.
- Produces: CLI exit status, `validate_api(root: Path) -> list[str]`.

- [ ] **Step 1: Write failing tests**

Create tests for missing evidence ids, invalid payload byte ranges, missing required ledger fields, and dangerous command misclassification.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_validate_api.py -q`

Expected: FAIL because `validate_api.py` does not exist.

- [ ] **Step 3: Implement validator**

Implement checks from the spec:

- Ledger evidence id exists in indexes.
- Source paths in index records exist.
- Ledger records include `confidence`, `safety`, and `implementationStatus`.
- Dangerous command ids or notes involving auto-learn/reset/firmware/security are not `passive_observe` or `safe_read`.
- Address and payload bytes are integers in `0..255`.

- [ ] **Step 4: Run validator tests**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_validate_api.py -q`

Expected: PASS.

- [ ] **Step 5: Run live validation**

Run: `uv run --project tools/registers tools/registers/validate_api.py`

Expected: PASS with `OK`.

### Task 4: Generated API Docs

**Files:**
- Create: `tools/registers/gen_api_docs.py`
- Test: `tools/registers/tests/test_gen_api_docs.py`
- Create: `protocol/api/generated/API.md`
- Create: `protocol/api/generated/COMMANDS.md`
- Create: `protocol/api/generated/APP_OPTIONS.md`
- Create: `protocol/api/generated/FILE_FORMATS.md`

**Interfaces:**
- Consumes: ledger JSON files.
- Produces: `render_all(root: Path) -> dict[str, str]`.

- [ ] **Step 1: Write failing docs tests**

Create tests that assert command docs include command names, safety classes, address/payload, and evidence ids.

- [ ] **Step 2: Run tests to verify failure**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_gen_api_docs.py -q`

Expected: FAIL because `gen_api_docs.py` does not exist.

- [ ] **Step 3: Implement docs generator**

Implement deterministic Markdown rendering for API overview, commands, app options, and file formats.

- [ ] **Step 4: Run docs tests**

Run: `uv run --project tools/registers pytest tools/registers/tests/test_gen_api_docs.py -q`

Expected: PASS.

- [ ] **Step 5: Generate docs**

Run: `uv run --project tools/registers tools/registers/gen_api_docs.py`

Expected: writes files under `protocol/api/generated/`.

### Task 5: End-To-End Verification

**Files:**
- Modify: `tools/registers/tests/test_validate.py` only if integration into the existing validator is needed.

**Interfaces:**
- Consumes: all tooling from prior tasks.
- Produces: passing test and validation commands.

- [ ] **Step 1: Run all register tool tests**

Run: `uv run --project tools/registers pytest -q`

Expected: PASS.

- [ ] **Step 2: Run existing protocol validation**

Run: `uv run --project tools/registers tools/registers/validate.py`

Expected: PASS with `OK`.

- [ ] **Step 3: Run API validation**

Run: `uv run --project tools/registers tools/registers/validate_api.py`

Expected: PASS with `OK`.

- [ ] **Step 4: Regenerate API docs and check diff**

Run: `uv run --project tools/registers tools/registers/gen_api_docs.py`

Expected: no unstable output on a second run.

