import type { ConnectionState, RawLogEntry } from "@/ble/connection";
import type { DeviceInventory } from "@/ble/connection";
import { RX_FRAME_BUS_VOLTAGE, RX_FRAME_FAULT_BITS } from "@/test/fixtures";
import { checksum, encodeLegacyRequest, encodeWrite } from "@/protocol/frame";
import { HEB_TOTAL_BYTES } from "@/protocol/heb";
import { hexToBytes } from "@/protocol/hex";
import { ControllerSession, type SessionConnection } from "./controllerSession";

class FakeConnection implements SessionConnection {
  state: ConnectionState = "idle";
  connectError: Error | null = null;
  writes: Uint8Array[] = [];
  frameListeners: Array<(bytes: Uint8Array) => void> = [];
  stateListeners: Array<(state: ConnectionState) => void> = [];
  logListeners: Array<(entry: RawLogEntry) => void> = [];
  inventoryListeners: Array<(inventory: DeviceInventory) => void> = [];

  getState() {
    return this.state;
  }

  async connect() {
    if (this.connectError) {
      throw this.connectError;
    }
    this.state = "connected";
    this.stateListeners.forEach((listener) => listener(this.state));
  }

  disconnect() {
    this.state = "disconnected";
    this.stateListeners.forEach((listener) => listener(this.state));
  }

  async write(bytes: Uint8Array) {
    this.writes.push(bytes);
    this.logListeners.forEach((listener) =>
      listener({ at: 1, direction: "tx", bytes, note: "write" }),
    );
  }

  onFrame(listener: (bytes: Uint8Array) => void) {
    this.frameListeners.push(listener);
    return () => undefined;
  }

  onState(listener: (state: ConnectionState) => void) {
    this.stateListeners.push(listener);
    listener(this.state);
    return () => undefined;
  }

  onLog(listener: (entry: RawLogEntry) => void) {
    this.logListeners.push(listener);
    return () => undefined;
  }

  onInventory(listener: (inventory: DeviceInventory) => void) {
    this.inventoryListeners.push(listener);
    return () => undefined;
  }

  emit(bytes: Uint8Array) {
    this.frameListeners.forEach((listener) => listener(bytes));
  }
}

it("starts read-only and requires backup before arming writes", () => {
  const session = new ControllerSession({ connection: new FakeConnection(), now: () => 1000 });
  expect(session.snapshot().writeMode).toBe("read-only");
  session.setWriteMode("armed");
  expect(session.snapshot().writeMode).toBe("read-only");
  expect(session.snapshot().errors.at(-1)).toContain("backup");
});

it("keeps writes locked after a passive JSON snapshot", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  await session.backupRegisters();
  expect(session.snapshot().backup.required).toBe(true);
  expect(connection.writes).toHaveLength(0);
  expect(session.snapshot().log.at(-1)?.note).toContain("HEB backup");
  session.setWriteMode("armed");
  expect(session.snapshot().writeMode).toBe("read-only");
});

it("allows arming writes only after a complete HEB backup", () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  emitCompleteHebDump(connection);
  expect(session.snapshot().backup.required).toBe(false);
  session.setWriteMode("armed");
  expect(session.snapshot().writeMode).toBe("armed");
});

it("records Bluetooth connection errors with their exact message", async () => {
  const connection = new FakeConnection();
  connection.connectError = new Error("GATT operation failed for unknown reason.");
  const session = new ControllerSession({ connection, now: () => 1000 });

  await expect(session.connect()).rejects.toThrow("GATT operation failed");

  expect(session.snapshot().errors.at(-1)).toBe("Bluetooth connection failed: GATT operation failed for unknown reason.");
});

it("requests a full HEB backup with the official stream trigger and no autolearn write", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });

  await session.backupHeb();

  expect(connection.writes.map((frame) => Array.from(frame))).toContainEqual(
    Array.from(encodeLegacyRequest(19, 7, 10, 56)),
  );
  expect(connection.writes.map((frame) => Array.from(frame))).not.toContainEqual(Array.from(encodeWrite(160, 0x0288)));

  emitCompleteHebDump(connection);

  const snapshot = session.snapshot();
  expect(snapshot.backup.required).toBe(false);
  expect(snapshot.backup.heb.completedAt).toBe(1000);
  expect(session.exportHebBackup()).toHaveLength(HEB_TOTAL_BYTES);
});

it("hydrates current setting values from HEB words", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });

  emitCompleteHebDump(connection);

  expect(session.snapshot().registerValues.rated_voltage).toBeCloseTo(2.3);
  expect(session.snapshot().registerValues.custom_max_line_current).toBeCloseTo(9.5);
  expect(session.snapshot().registerValues.throttle_voltage_range).toBeCloseTo(0.4);
});

it("rejects writes in read-only mode", async () => {
  const session = new ControllerSession({ connection: new FakeConnection() });
  await session.writeRegister("rated_voltage", 48);
  expect(session.snapshot().errors.at(-1)).toContain("read-only");
});

it("rejects out-of-range writes", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  emitCompleteHebDump(connection);
  session.setWriteMode("armed");
  await session.writeRegister("rated_voltage", 7000);
  expect(session.snapshot().errors.at(-1)).toContain("at most");
});

it("writes scaled raw values", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  emitCompleteHebDump(connection);
  session.setWriteMode("armed");
  await session.writeRegister("rated_voltage", 48);
  expect(Array.from(connection.writes.at(-1)!)).toEqual([0xaa, 0xc6, 0x17, 0x17, 0xe0, 0x01, 0xbd, 0x5d]);
});


it("does not fail a pending write when unrelated telemetry arrives first", async () => {
  let now = 1000;
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => now });
  emitCompleteHebDump(connection);
  session.setWriteMode("armed");

  await session.writeRegister("rated_voltage", 48);
  connection.emit(hexToBytes(RX_FRAME_BUS_VOLTAGE));

  expect(session.snapshot().errors.some((error) => error.includes("Read-back unavailable"))).toBe(false);

  connection.emit(rxFrame(0x86, 475));
  expect(session.snapshot().registerValues.rated_voltage).toBe(48);
  now = 1200;
});


it("does not block later writes when a register has no streamed read-back mapping", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  emitCompleteHebDump(connection);
  session.setWriteMode("armed");

  await session.writeRegister("max_acceleration", 170);
  await session.writeRegister("max_acceleration", 180);

  expect(connection.writes).toHaveLength(2);
  expect(session.snapshot().log.at(-1)?.note).toContain("verify with a fresh HEB dump");
});

it("does not let an imported JSON backup unlock controller writes", () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  session.importBackup(JSON.stringify({ schema: "fardriver-backup/v1", values: { rated_voltage: 48 } }));
  session.setWriteMode("armed");
  expect(session.snapshot().writeMode).toBe("read-only");
  expect(session.snapshot().backup.required).toBe(true);
});

it("decodes telemetry and raw bitfields from incoming frames", () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection });
  connection.emit(hexToBytes(RX_FRAME_BUS_VOLTAGE));
  expect(session.snapshot().telemetry.bus_voltage).toBe(72);
  connection.emit(hexToBytes(RX_FRAME_FAULT_BITS));
  expect(session.snapshot().telemetry.fault_status_word).toBe(257);
});

it("logs bad checksum frames without updating telemetry", () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  const bad = hexToBytes(RX_FRAME_BUS_VOLTAGE);
  bad[15] ^= 0xff;
  connection.emit(bad);
  expect(session.snapshot().telemetry).toEqual({});
  expect(session.snapshot().errors.at(-1)).toContain("checksum");
  expect(session.snapshot().log.at(-1)?.note).toContain("checksum");
});

it("includes checksum diagnostics and last TX context for dropped RX frames", async () => {
  const connection = new FakeConnection();
  const session = new ControllerSession({ connection, now: () => 1000 });
  await session.backupHeb();
  const bad = hexToBytes(RX_FRAME_BUS_VOLTAGE);
  bad[15] ^= 0xff;

  connection.emit(bad);

  const note = session.snapshot().log.at(-1)?.note ?? "";
  expect(note).toContain("expected=");
  expect(note).toContain("actual=");
  expect(note).toContain("len=16");
  expect(note).toContain("cmd=0x");
  expect(note).toContain("lastTx=aa13ec070a38f20d");
});

function emitCompleteHebDump(connection: FakeConnection) {
  const mainResponseIndexes = [
    3, 4, 5, 6, 10, 11, 12, 13, 17, 19, 20, 24, 25, 26, 27, 31, 32, 33, 34, 38,
    39, 40, 41, 45, 46, 47,
  ];
  for (const [block, responseIndex] of mainResponseIndexes.entries()) {
    connection.emit(rxFrame(0x80 | responseIndex, block * 6));
  }
  for (let responseIndex = 56; responseIndex <= 87; responseIndex += 1) {
    connection.emit(rxFrame(0x80 | responseIndex, 0x1000 + (responseIndex - 56) * 6));
  }
}

function rxFrame(cmd: number, startWord: number): Uint8Array {
  const words = Array.from({ length: 6 }, (_, index) => startWord + index);
  const body = [
    0xaa,
    cmd,
    ...words.flatMap((word) => [word & 0xff, (word >> 8) & 0xff]),
  ];
  const crc = checksum(Uint8Array.from(body));
  return Uint8Array.from([...body, (crc >> 8) & 0xff, crc & 0xff]);
}
