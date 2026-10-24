# Phase 2 Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FarDriver Web Bluetooth app described in the approved design: a Vite + TypeScript app that can connect to the controller, decode live frames, browse/edit explained registers safely, capture raw logs, and export/import backups.

**Architecture:** The app is split into pure protocol modules, a Web Bluetooth transport/session layer, and React UI feature modules. Pure protocol code is unit-tested first from the Python reference implementation and `docs/protocol.md`; BLE code is dependency-injected so it can be tested without a real browser device; UI components consume a typed session state and never hand-roll frame parsing.

**Tech Stack:** Vite, React, TypeScript, Vitest, Testing Library, Web Bluetooth, CSS modules/plain CSS, `protocol/registers.json`, `protocol/telemetry.json`.

**Spec:** `docs/superpowers/specs/2026-09-21-fardriver-protocol-and-web-app-design.md` sections 5 and 7, plus `docs/protocol.md`, `protocol/registers.json`, `protocol/telemetry.json`, and `docs/validation.md`.

## Global Constraints

- Do not commit unless the user explicitly asks; this run is continuing without commits.
- Keep `protocol/registers.json` and `protocol/telemetry.json` as the single source of truth. Import them into `web/`; do not duplicate their contents by hand.
- Vite dev server uses fixed port `8787`, host `0.0.0.0`, `allowedHosts = ['fardriver.madsaks.au']`, and HMR client port `443`.
- Web Bluetooth requires a secure context; the local dev server is expected to sit behind the user's Caddy TLS proxy at `fardriver.madsaks.au`.
- App starts read-only. Writes require a deliberate write-mode toggle, a backup first, a confirmation dialog for every write, client-side min/max validation, and read-back verification.
- No firmware flashing in Phase 2.
- No decompiled code may be copied into `web/`; port behavior from `docs/protocol.md` and the clean Python reference only.
- Values with `confidence !== 'high'` must be visibly marked as unverified in the settings UI.
- Every checksum failure must be dropped from decoded state and logged in Raw Log.
- Treat `encode_read(addr)` as constructed, not confirmed by the official app; keep UI copy conservative around reads.

---

## File Map

| Path | Responsibility |
|---|---|
| `web/package.json` | Frontend scripts and dependencies. |
| `web/vite.config.ts` | Vite config, port/host/HMR, root-data aliases. |
| `web/tsconfig.json` | Strict TypeScript settings. |
| `web/index.html` | App shell mount point. |
| `web/src/main.tsx` | React bootstrap. |
| `web/src/App.tsx` | Top-level layout, tabs, session wiring. |
| `web/src/styles.css` | App-wide layout and visual system. |
| `web/src/protocol/frame.ts` | TypeScript port of checksum, TX encoders, RX decoder. |
| `web/src/protocol/telemetry.ts` | Typed telemetry decoder using `protocol/telemetry.json`. |
| `web/src/protocol/registers.ts` | Register metadata loading, grouping, scaling, validation helpers. |
| `web/src/protocol/hex.ts` | Hex encode/decode helpers. |
| `web/src/ble/connection.ts` | Web Bluetooth transport: request, connect, subscribe, write, reconnect. |
| `web/src/session/controllerSession.ts` | State machine: read-only/write mode, backup, read/write/read-back, raw log. |
| `web/src/ui/Dashboard.tsx` | Live telemetry display. |
| `web/src/ui/Settings.tsx` | Grouped register editor with safety checks. |
| `web/src/ui/RawLog.tsx` | Raw frame log, filters, export. |
| `web/src/ui/Backup.tsx` | Backup export/import flow. |
| `web/src/test/fixtures.ts` | Shared frame examples from `tools/protocol/tests/test_frame.py`. |
| `web/src/**/*.test.ts(x)` | Vitest coverage for protocol, session, and core UI workflows. |
| `web/fardriver-web.service` | User-level systemd service for Vite dev server. |

---

## Task 1: Vite React Scaffold And Test Harness

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`
- Create: `web/src/test/setup.ts`

**Interfaces:**
- Produces npm scripts: `dev`, `build`, `test`, `test:run`.
- Produces Vite aliases: `@` -> `web/src`, `@protocol-data` -> repo root `protocol`.
- Later tasks assume JSON imports from `@protocol-data/registers.json` and `@protocol-data/telemetry.json`.

- [ ] **Step 1: Write scaffold files**

Create `web/package.json`:

```json
{
  "name": "fardriver-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 8787",
    "build": "tsc -b && vite build",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "typescript": "^5.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.0",
    "vitest": "^2.1.0"
  }
}
```

Create `web/vite.config.ts`:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@protocol-data": path.resolve(__dirname, "../protocol"),
    },
  },
  server: {
    host: true,
    port: 8787,
    allowedHosts: ["fardriver.madsaks.au"],
    hmr: { clientPort: 443 },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
  },
});
```

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create the initial React shell:

```tsx
// web/src/App.tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">FarDriver BLE</p>
          <h1>Controller Console</h1>
        </div>
        <span className="status-pill">Read-only</span>
      </section>
      <section className="empty-state">
        <h2>Protocol tools ready</h2>
        <p>Connect and tuning surfaces will appear as the Phase 2 tasks land.</p>
      </section>
    </main>
  );
}
```

```tsx
// web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Install dependencies**

Run from repo root:

```bash
corepack pnpm -C web install
```

If `corepack` or network access is blocked, stop and report the exact error; do not switch package managers without user approval.

- [ ] **Step 3: Verify scaffold**

Run:

```bash
corepack pnpm -C web test:run
corepack pnpm -C web build
```

Expected: Vitest reports no test files or passes once tests are added; build exits 0.

---

## Task 2: Pure Protocol Frame Port

**Files:**
- Create: `web/src/protocol/frame.ts`
- Create: `web/src/protocol/hex.ts`
- Create: `web/src/test/fixtures.ts`
- Create: `web/src/protocol/frame.test.ts`

**Interfaces:**
- `checksum(payload: Uint8Array): number`
- `encodeRead(addr: number): Uint8Array`
- `encodeWrite(addr: number, value: number): Uint8Array`
- `decodeFrame(frame: Uint8Array): DecodedFrame`
- `DecodedFrame = { cmd: number; addr: null; payload: Uint8Array; checksumOk: boolean; family: 'telemetry' | 'control' | 'invalid' }`
- `bytesToHex(bytes: Uint8Array): string`
- `hexToBytes(hex: string): Uint8Array`

- [ ] **Step 1: Write failing tests from Python fixtures**

Use the constants from `tools/protocol/tests/test_frame.py`:

```ts
import { checksum, decodeFrame, encodeRead, encodeWrite } from "./frame";
import { hexToBytes } from "./hex";

const READ_TX = "aac417171253";
const WRITE_TX = "aac61717e001bd5d";
const RX_FRAME = "aa80000000000000dc05000000001d34";
const RX_FRAME_INDEX_72 = "aac800000000000000000000000023e0";
const RX_FRAME_SERIAL = "aa7c87d6120000000000000000000295";

it("matches the documented checksum example", () => {
  const frame = hexToBytes(READ_TX);
  expect(checksum(frame.slice(0, -2))).toBe(0x1253);
});

it("encodes constructed register reads", () => {
  expect(Array.from(encodeRead(0x17))).toEqual(Array.from(hexToBytes(READ_TX)));
});

it("encodes 16-bit little-endian writes", () => {
  expect(Array.from(encodeWrite(0x17, 480))).toEqual(Array.from(hexToBytes(WRITE_TX)));
});

it("decodes top-bit-set RX frames as telemetry even when cmd is 0xC0 or above", () => {
  const decoded = decodeFrame(hexToBytes(RX_FRAME_INDEX_72));
  expect(decoded.checksumOk).toBe(true);
  expect(decoded.cmd).toBe(0xc8);
  expect(decoded.family).toBe("telemetry");
});

it("decodes top-bit-clear serial frames with additive checksum", () => {
  const decoded = decodeFrame(hexToBytes(RX_FRAME_SERIAL));
  expect(decoded.checksumOk).toBe(true);
  expect(decoded.cmd).toBe(0x7c);
  expect(decoded.family).toBe("control");
});

it("rejects checksum failures without throwing", () => {
  const bad = hexToBytes(RX_FRAME);
  bad[15] ^= 0xff;
  expect(decodeFrame(bad).checksumOk).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
corepack pnpm -C web test:run src/protocol/frame.test.ts
```

Expected: module/function import failures.

- [ ] **Step 3: Implement the TypeScript port**

Port `_CRC_LO`, `_CRC_HI`, custom initial state `(0x3C, 0x7F)`, TX frame construction, and RX family selection from `tools/protocol/fardriver_frame.py`. Keep the TypeScript comments citation-oriented and short; cite `docs/protocol.md` rather than decompiled source.

- [ ] **Step 4: Run protocol frame tests**

Run:

```bash
corepack pnpm -C web test:run src/protocol/frame.test.ts
```

Expected: all tests pass.

---

## Task 3: Register And Telemetry Metadata Loaders

**Files:**
- Create: `web/src/protocol/registers.ts`
- Create: `web/src/protocol/registers.test.ts`
- Create: `web/src/protocol/telemetry.ts`
- Create: `web/src/protocol/telemetry.test.ts`

**Interfaces:**
- `type RegisterMeta`
- `type TelemetryMeta`
- `allRegisters(): RegisterMeta[]`
- `registerGroups(): Array<{ group: string; registers: RegisterMeta[] }>`
- `validateRegisterValue(register: RegisterMeta, displayValue: number): string | null`
- `toRawRegisterValue(register: RegisterMeta, displayValue: number): number`
- `fromRawRegisterValue(register: RegisterMeta, rawValue: number): number`
- `decodeTelemetry(frame: DecodedFrame): Record<string, number>`

- [ ] **Step 1: Write metadata tests**

Tests must prove:
- `allRegisters()` loads 110 entries.
- `registerGroups()` includes `motor`, `battery`, `limits`, `throttle`.
- `validateRegisterValue()` rejects values below `min` or above `max`.
- Scaling round-trips for a known scaled entry.
- `decodeTelemetry()` returns `bus_voltage: 72.0` for frame `aa81d0020000000000000000000009ef`.
- `decodeTelemetry()` returns raw integer bitfields for frame `aa800000010100000000000000009e3d`.
- Repeat cmd bytes normalize as in the Python test: `0x80` and `0x87` decode the same logical telemetry fields.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
corepack pnpm -C web test:run src/protocol/registers.test.ts src/protocol/telemetry.test.ts
```

Expected: import failures.

- [ ] **Step 3: Implement loaders and decoder**

Implementation details:
- Import JSON directly:

```ts
import registersJson from "@protocol-data/registers.json";
import telemetryJson from "@protocol-data/telemetry.json";
```

- Treat `bitfield` as a two-byte unsigned integer.
- Treat `enum` as a one-byte unsigned integer unless a current JSON entry requires wider handling.
- Multiply signed/unsigned numeric values by `scale`; leave bitfield values unscaled as integers.
- Implement `FLASH_READ_ADDR` exactly as in `tools/protocol/fardriver_frame.py`.
- Normalize repeated RX command bytes to the lowest command byte carrying the same logical id before matching `telemetry.json`.

- [ ] **Step 4: Run metadata tests**

Run:

```bash
corepack pnpm -C web test:run src/protocol/registers.test.ts src/protocol/telemetry.test.ts
```

Expected: all tests pass.

---

## Task 4: Web Bluetooth Connection Adapter

**Files:**
- Create: `web/src/ble/connection.ts`
- Create: `web/src/ble/connection.test.ts`

**Interfaces:**
- `type ConnectionState = 'idle' | 'requesting' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'unsupported' | 'error'`
- `type RawFrameDirection = 'rx' | 'tx'`
- `type RawLogEntry = { at: number; direction: RawFrameDirection; bytes: Uint8Array; note: string }`
- `class FarDriverBleConnection`
- Constructor accepts `{ bluetooth: BluetoothLike; now?: () => number }`
- Methods: `isSupported(): boolean`, `connect(): Promise<void>`, `disconnect(): void`, `write(bytes: Uint8Array): Promise<void>`, `onFrame(listener)`, `onState(listener)`, `onLog(listener)`

- [ ] **Step 1: Write BLE adapter tests with fakes**

Cover:
- Unsupported browser when `bluetooth` is missing.
- `requestDevice` filter includes names/prefixes matching `YUANQU`, `CONTROL`, and `BMS`.
- Service UUID is `0000ffe0-0000-1000-8000-00805f9b34fb`.
- Characteristic UUID is `0000ffec-0000-1000-8000-00805f9b34fb`.
- Notifications call the registered frame listener with received bytes.
- `write()` logs outgoing bytes.

- [ ] **Step 2: Run BLE tests to verify they fail**

Run:

```bash
corepack pnpm -C web test:run src/ble/connection.test.ts
```

Expected: import failures.

- [ ] **Step 3: Implement connection adapter**

Implementation details:
- Use a narrow `BluetoothLike` interface instead of relying on global DOM Bluetooth typings in tests.
- Request device filters:

```ts
filters: [
  { namePrefix: "YUANQU" },
  { namePrefix: "CONTROL" },
  { namePrefix: "BMS" }
],
optionalServices: ["0000ffe0-0000-1000-8000-00805f9b34fb"]
```

- Subscribe to characteristic `valuechanged` and pass each notification as a `Uint8Array`.
- Use the same characteristic for write and notify.
- Do not implement real reconnection timing in this task; expose state transitions and a disconnected event for Task 5.

- [ ] **Step 4: Run BLE tests**

Run:

```bash
corepack pnpm -C web test:run src/ble/connection.test.ts
```

Expected: all tests pass.

---

## Task 5: Controller Session, Safety Rails, Backup, And Read-Back

**Files:**
- Create: `web/src/session/controllerSession.ts`
- Create: `web/src/session/controllerSession.test.ts`

**Interfaces:**
- `type WriteMode = 'read-only' | 'armed'`
- `type BackupState = { required: boolean; completedAt: number | null; values: Record<string, number> }`
- `type ControllerSnapshot = { connection: ConnectionState; writeMode: WriteMode; telemetry: Record<string, number>; registerValues: Record<string, number>; backup: BackupState; log: RawLogEntry[]; errors: string[] }`
- `class ControllerSession`
- Constructor accepts `{ connection, registers, now }`
- Methods: `snapshot()`, `subscribe(listener)`, `connect()`, `setWriteMode(mode)`, `recordFrame(bytes)`, `backupRegisters()`, `writeRegister(key, displayValue)`, `exportBackup()`, `importBackup(json)`

- [ ] **Step 1: Write session tests**

Cover:
- App starts `read-only`.
- `setWriteMode('armed')` fails until backup is complete.
- `backupRegisters()` sends constructed read frames for every writable register with an `rx_frame`/`rx_offset` when possible, records an empty value as `null` only when read-back is unavailable, and marks backup complete.
- `writeRegister()` rejects read-only mode.
- `writeRegister()` rejects values outside metadata min/max.
- `writeRegister()` calls `encodeWrite()` with the raw scaled integer.
- `writeRegister()` reports a read-back mismatch instead of marking saved.
- Bad checksum RX frames are logged and do not update telemetry/register state.

- [ ] **Step 2: Run session tests to verify they fail**

Run:

```bash
corepack pnpm -C web test:run src/session/controllerSession.test.ts
```

Expected: import failures.

- [ ] **Step 3: Implement session state machine**

Implementation notes:
- Use immutable snapshots so React can subscribe safely.
- Cap in-memory raw log at 500 entries.
- Store `registerValues` by register key.
- For read-back, map incoming RX frames to register metadata using `rx_frame` and `rx_offset`; if a register has no read mapping, require the user to rely on backup/export and show "read-back unavailable" in UI later.
- Do not silently unlock. The unlock/password flow is documented, but Phase 2 should only attempt it if the user arms write mode and the required client id/config is available in a later task.

- [ ] **Step 4: Run session tests**

Run:

```bash
corepack pnpm -C web test:run src/session/controllerSession.test.ts
```

Expected: all tests pass.

---

## Task 6: App Layout, Dashboard, And Raw Log UI

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/styles.css`
- Create: `web/src/ui/Dashboard.tsx`
- Create: `web/src/ui/RawLog.tsx`
- Create: `web/src/ui/ConnectionBar.tsx`
- Create: `web/src/ui/Dashboard.test.tsx`
- Create: `web/src/ui/RawLog.test.tsx`

**Interfaces:**
- `Dashboard({ telemetry }: { telemetry: Record<string, number> })`
- `RawLog({ entries }: { entries: RawLogEntry[] })`
- `ConnectionBar({ state, writeMode, onConnect, onArmWrites })`

- [ ] **Step 1: Write UI tests**

Cover:
- Dashboard renders speed/rpm/voltage/current/temperature fields when present.
- Missing telemetry renders stable placeholders, not `undefined`.
- Raw Log renders RX/TX direction, hex bytes, checksum-failure notes, and an export button.
- Connection bar says when Web Bluetooth is unsupported.
- Write-mode toggle is disabled until backup is complete.

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
corepack pnpm -C web test:run src/ui/Dashboard.test.tsx src/ui/RawLog.test.tsx
```

Expected: import failures.

- [ ] **Step 3: Implement UI**

Design requirements:
- First screen is the usable console, not a marketing page.
- Use a quiet operational interface: top connection/status bar, left tab navigation, main dense content.
- Use icons from `lucide-react` for connect, download/export, upload/import, warning, lock, and log controls.
- Do not use nested cards; use full-width panels and simple tables/lists.
- Keep headings compact in tool surfaces.
- Ensure long register names and raw hex wrap without overflowing on mobile.

- [ ] **Step 4: Run UI tests**

Run:

```bash
corepack pnpm -C web test:run src/ui/Dashboard.test.tsx src/ui/RawLog.test.tsx
```

Expected: all tests pass.

---

## Task 7: Settings Editor And Backup UI

**Files:**
- Create: `web/src/ui/Settings.tsx`
- Create: `web/src/ui/Backup.tsx`
- Create: `web/src/ui/Settings.test.tsx`
- Create: `web/src/ui/Backup.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- `Settings({ groups, values, writeMode, onWrite })`
- `Backup({ backup, onExport, onImport, onRunBackup })`

- [ ] **Step 1: Write Settings tests**

Cover:
- Registers are grouped by metadata `group`.
- Each row shows `name`, current value, unit, confidence, and `explain`.
- Low/medium confidence entries show an "Unverified" or "Needs bike validation" marker.
- Editing is disabled in read-only mode.
- Out-of-range values show the validation error before `onWrite` is called.
- The confirmation dialog includes old value, new value, unit, and explanation.

- [ ] **Step 2: Write Backup tests**

Cover:
- Backup panel shows whether a backup is required before writes.
- Export produces JSON with metadata version, timestamp, register values, and raw values where available.
- Import rejects malformed JSON.
- Import previews changed keys before applying.

- [ ] **Step 3: Run Settings/Backup tests to verify they fail**

Run:

```bash
corepack pnpm -C web test:run src/ui/Settings.test.tsx src/ui/Backup.test.tsx
```

Expected: import failures.

- [ ] **Step 4: Implement Settings and Backup**

Implementation notes:
- Prefer numeric inputs with `min`, `max`, and `step` derived from metadata.
- Render enums as `<select>` with labels from metadata.
- For bitfields, render a read-only raw value first; do not invent bit editors until bit layout is modeled in JSON.
- Save/import backup through browser `Blob` and file input APIs.

- [ ] **Step 5: Run Settings/Backup tests**

Run:

```bash
corepack pnpm -C web test:run src/ui/Settings.test.tsx src/ui/Backup.test.tsx
```

Expected: all tests pass.

---

## Task 8: Dev Service, Full Verification, And Browser Smoke

**Files:**
- Create: `web/fardriver-web.service`
- Modify: `docs/validation.md` only if Task 7 changes the expected validation workflow text.

**Interfaces:**
- Produces a user service that runs `corepack pnpm -C /home/madsaks/fardriver/web dev`.

- [ ] **Step 1: Add systemd user service**

Create `web/fardriver-web.service`:

```ini
[Unit]
Description=FarDriver Web Bluetooth console
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/madsaks/fardriver/web
ExecStart=/usr/bin/env corepack pnpm dev
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Run full test/build verification**

Run:

```bash
UV_CACHE_DIR=/tmp/fardriver-uv-cache uv run --project tools/registers tools/registers/validate.py
UV_CACHE_DIR=/tmp/fardriver-uv-cache uv run --group dev pytest -q
UV_CACHE_DIR=/tmp/fardriver-uv-cache uv run --group dev pytest -q
corepack pnpm -C web test:run
corepack pnpm -C web build
```

The two Python pytest commands must be run in their correct directories:

```bash
(cd tools/registers && UV_CACHE_DIR=/tmp/fardriver-uv-cache uv run --group dev pytest -q)
(cd tools/protocol && UV_CACHE_DIR=/tmp/fardriver-uv-cache uv run --group dev pytest -q)
```

Expected:
- Register validator prints `OK`.
- `tools/registers` tests pass.
- `tools/protocol` tests pass.
- Web tests pass.
- Web build passes.

- [ ] **Step 3: Start dev server**

Run:

```bash
corepack pnpm -C web dev -- --host 0.0.0.0 --port 8787
```

If port 8787 is occupied, identify the owning process and ask before killing it.

- [ ] **Step 4: Browser smoke test**

Use Playwright or the available browser tool if present. Check:
- `http://localhost:8787` loads.
- No console errors on initial load.
- Desktop width 1440: connection bar, tabs, dashboard, settings, backup, and raw log are reachable.
- Mobile width 390: no horizontal overflow; long names and hex wrap.
- Web Bluetooth unavailable state is readable in non-Chrome test browsers.

- [ ] **Step 5: Final working-tree report**

Run:

```bash
git status --short --branch
git status --short -- reference
```

Expected:
- Phase 2 files under `web/` are present.
- Nothing under `reference/` is tracked or dirty.
- Do not commit unless the user explicitly asks.

---

## Self-Review

Spec coverage:
- Serving requirements are covered by Task 1 and Task 8.
- Pure protocol and test fixtures are covered by Tasks 2 and 3.
- Web Bluetooth connect/subscribe/write is covered by Task 4.
- Safety rails, backup, write confirmation, validation, and read-back are covered by Tasks 5 and 7.
- Dashboard, settings, raw log, and backup UI are covered by Tasks 6 and 7.
- Validation-on-bike handoff remains in `docs/validation.md` and is surfaced by Task 7.

Known gaps intentionally left out:
- Real firmware flashing is out of scope.
- A bit-level editor for packed bitfields is out of scope until bit layouts are modeled structurally.
- Automatic unlock/password send is not enabled by default; Task 5 keeps it gated behind later explicit client-id configuration.

Execution recommendation:
- Use inline execution for Task 1 first, because dependency installation and local build behavior need immediate feedback in this workspace.
- Once scaffold and tests are stable, Tasks 2-4 can be implemented independently.
