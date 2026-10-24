import type { BleProfile, ConnectionState, DeviceInventory, RawLogEntry } from "@/ble/connection";
import { bytesToHex } from "@/protocol/hex";
import { decodeFrame, encodeLegacyRequest, encodeWrite } from "@/protocol/frame";
import {
  applyHebFrame,
  buildHebFile,
  createEmptyHebDump,
  decodeHebWordsFromFrame,
  hebMainWordOffsetForAddress,
  hebDumpReadAddresses,
  isHebDumpComplete,
  type HebDumpWords,
} from "@/protocol/heb";
import { decodeTelemetry } from "@/protocol/telemetry";
import {
  allRegisters,
  fromRawRegisterValue,
  toRawRegisterValue,
  validateRegisterValue,
  type RegisterMeta,
} from "@/protocol/registers";

export type WriteMode = "read-only" | "armed";

export type BackupState = {
  required: boolean;
  completedAt: number | null;
  values: Record<string, number | null>;
  heb: {
    requestedAt: number | null;
    completedAt: number | null;
    mainWordsReceived: number;
    extendedWordsReceived: number;
    dump: HebDumpWords;
  };
};

export type ControllerSnapshot = {
  connection: ConnectionState;
  writeMode: WriteMode;
  telemetry: Record<string, number>;
  registerValues: Record<string, number>;
  backup: BackupState;
  log: RawLogEntry[];
  deviceInventory: DeviceInventory | null;
  errors: string[];
};

export type SessionConnection = {
  getState(): ConnectionState;
  connect(profile?: BleProfile): Promise<void>;
  disconnect(): void;
  write(bytes: Uint8Array): Promise<void>;
  onFrame(listener: (bytes: Uint8Array) => void): () => void;
  onState(listener: (state: ConnectionState) => void): () => void;
  onLog(listener: (entry: RawLogEntry) => void): () => void;
  onInventory(listener: (inventory: DeviceInventory) => void): () => void;
};

export type ControllerCapture = {
  schema: "fardriver-capture/v1";
  capturedAt: string;
  connection: ConnectionState;
  writeMode: WriteMode;
  telemetry: Record<string, number>;
  registerValues: Record<string, number>;
  backup: BackupState;
  deviceInventory: DeviceInventory | null;
  log: Array<Omit<RawLogEntry, "bytes"> & { hex: string }>;
  errors: string[];
};

type Listener = (snapshot: ControllerSnapshot) => void;

const LOG_LIMIT = 500;

export class ControllerSession {
  private snapshotValue: ControllerSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly registers: RegisterMeta[];
  private readonly now: () => number;
  private pendingWrite: { key: string; displayValue: number; sentAt: number } | null = null;
  private lastTx: RawLogEntry | null = null;

  constructor(options: { connection: SessionConnection; registers?: RegisterMeta[]; now?: () => number }) {
    this.registers = options.registers ?? allRegisters();
    this.now = options.now ?? (() => Date.now());
    this.snapshotValue = {
      connection: options.connection.getState(),
      writeMode: "read-only",
      telemetry: {},
      registerValues: {},
      backup: {
        required: true,
        completedAt: null,
        values: {},
        heb: emptyHebBackup(),
      },
      log: [],
      deviceInventory: null,
      errors: [],
    };

    options.connection.onState((connection) => this.update({ connection }));
    options.connection.onLog((entry) => this.pushLog(entry));
    options.connection.onFrame((bytes) => this.recordFrame(bytes));
    options.connection.onInventory((deviceInventory) => this.update({ deviceInventory }));
    this.connection = options.connection;
  }

  private readonly connection: SessionConnection;

  snapshot(): ControllerSnapshot {
    return structuredCloneSnapshot(this.snapshotValue);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(profile: BleProfile = "fardriver"): Promise<void> {
    try {
      await this.connection.connect(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bluetooth connection failed.";
      this.pushError(`Bluetooth connection failed: ${message}`);
      throw error;
    }
  }

  disconnect(): void {
    this.connection.disconnect();
    this.update({ writeMode: "read-only" });
  }

  setWriteMode(mode: WriteMode): void {
    if (mode === "armed" && this.snapshotValue.backup.required) {
      this.pushError("Run a complete HEB backup before arming writes.");
      return;
    }
    this.update({ writeMode: mode });
  }

  recordFrame(bytes: Uint8Array): void {
    this.recordHebFrame(bytes);
    const frame = decodeFrame(bytes);
    if (!frame.checksumOk) {
      this.pushLog({ at: this.now(), direction: "rx", bytes, note: this.checksumFailureNote(frame) });
      this.pushError("Dropped RX frame with invalid checksum.");
      return;
    }

    const telemetry = decodeTelemetry(frame);
    const registerValues = this.decodeRegisterValues(frame.cmd, frame.payload);
    const updates = { ...telemetry, ...registerValues };
    const nextRegisterValues = { ...this.snapshotValue.registerValues, ...registerValues };
    this.update({
      telemetry: { ...this.snapshotValue.telemetry, ...telemetry },
      registerValues: nextRegisterValues,
    });

    if (this.pendingWrite) {
      const observed = updates[this.pendingWrite.key];
      if (observed !== undefined) {
        if (observed !== this.pendingWrite.displayValue) {
          this.pushError(`Read-back mismatch for ${this.pendingWrite.key}.`);
        }
        this.pendingWrite = null;
      } else if (this.now() - this.pendingWrite.sentAt > 5000) {
        this.pushError(`Timed out waiting for read-back of ${this.pendingWrite.key}.`);
        this.pendingWrite = null;
      }
    }
  }

  async backupRegisters(): Promise<void> {
    const values: Record<string, number | null> = {};
    for (const register of this.registers) {
      if (register.access !== "rw") {
        continue;
      }
      values[register.key] = this.snapshotValue.registerValues[register.key] ?? null;
    }
    this.update({
      backup: {
        ...this.snapshotValue.backup,
        required: this.snapshotValue.backup.required,
        completedAt: this.snapshotValue.backup.completedAt,
        values,
      },
    });
    this.pushLog({
      at: this.now(),
      direction: "rx",
      bytes: new Uint8Array(),
      note: "passive JSON snapshot; complete HEB backup still required before writes",
    });
  }

  async backupHeb(): Promise<void> {
    this.update({
      backup: {
        ...this.snapshotValue.backup,
        required: true,
        completedAt: null,
        heb: {
          ...emptyHebBackup(),
          requestedAt: this.now(),
        },
      },
    });
    await this.connection.write(encodeLegacyRequest(19, 7, 10, 56));
    this.pushLog({
      at: this.now(),
      direction: "tx",
      bytes: new Uint8Array(),
      note: "requested full HEB backup stream",
    });
  }

  async writeRegister(key: string, displayValue: number): Promise<void> {
    if (this.snapshotValue.writeMode !== "armed") {
      this.pushError("Writes are disabled in read-only mode.");
      return;
    }

    const register = this.registers.find((entry) => entry.key === key);
    if (!register) {
      this.pushError(`Unknown register: ${key}.`);
      return;
    }
    if (register.access !== "rw") {
      this.pushError(`${register.name} is read-only.`);
      return;
    }

    const validationError = validateRegisterValue(register, displayValue);
    if (validationError) {
      this.pushError(validationError);
      return;
    }

    if (this.pendingWrite) {
      this.pushError(`Wait for read-back of ${this.pendingWrite.key} before sending another write.`);
      return;
    }

    const rawValue = toRawRegisterValue(register, displayValue);
    this.pendingWrite = { key, displayValue, sentAt: this.now() };
    try {
      await this.connection.write(encodeWrite(register.addr, rawValue));
    } catch (error) {
      this.pendingWrite = null;
      throw error;
    }
  }

  exportBackup(): string {
    return JSON.stringify(
      {
        schema: "fardriver-backup/v1",
        exportedAt: new Date(this.now()).toISOString(),
        values: this.snapshotValue.backup.values,
      },
      null,
      2,
    );
  }

  exportHebBackup(): Uint8Array {
    return buildHebFile(this.snapshotValue.backup.heb.dump);
  }

  exportCapture(): ControllerCapture {
    return {
      schema: "fardriver-capture/v1",
      capturedAt: new Date(this.now()).toISOString(),
      connection: this.snapshotValue.connection,
      writeMode: this.snapshotValue.writeMode,
      telemetry: { ...this.snapshotValue.telemetry },
      registerValues: { ...this.snapshotValue.registerValues },
      backup: { ...this.snapshotValue.backup, values: { ...this.snapshotValue.backup.values } },
      deviceInventory: this.snapshotValue.deviceInventory,
      log: this.snapshotValue.log.map((entry) => ({
        at: entry.at,
        direction: entry.direction,
        note: entry.note,
        hex: bytesToHex(entry.bytes),
      })),
      errors: [...this.snapshotValue.errors],
    };
  }

  importBackup(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      this.pushError("Backup JSON is malformed.");
      return;
    }
    if (!isBackupPayload(parsed)) {
      this.pushError("Backup JSON does not match fardriver-backup/v1.");
      return;
    }
    this.update({
      backup: {
        ...this.snapshotValue.backup,
        required: true,
        completedAt: this.snapshotValue.backup.completedAt,
        values: parsed.values,
      },
    });
  }

  private recordHebFrame(bytes: Uint8Array): void {
    const frame = decodeHebWordsFromFrame(bytes);
    if (!frame) {
      return;
    }
    const previousHeb = this.snapshotValue.backup.heb;
    const dump = applyHebFrame(previousHeb.dump, frame);
    const complete = isHebDumpComplete(dump);
    const hebRegisterValues = this.decodeHebRegisterValues(dump);
    this.update({
      registerValues: { ...this.snapshotValue.registerValues, ...hebRegisterValues },
      backup: {
        ...this.snapshotValue.backup,
        required: !complete,
        completedAt: complete ? (this.snapshotValue.backup.completedAt ?? this.now()) : this.snapshotValue.backup.completedAt,
        heb: {
          ...previousHeb,
          completedAt: complete ? (previousHeb.completedAt ?? this.now()) : previousHeb.completedAt,
          mainWordsReceived: countWords(dump.mainWords),
          extendedWordsReceived: countWords(dump.extendedWords),
          dump,
        },
      },
    });
  }

  private decodeHebRegisterValues(dump: HebDumpWords): Record<string, number> {
    const decoded: Record<string, number> = {};
    for (const register of this.registers) {
      const offset = hebMainWordOffsetForAddress(register.addr);
      if (offset === null) {
        continue;
      }
      const raw = readHebRawValue(dump.mainWords, offset, register.type);
      if (raw === null) {
        continue;
      }
      decoded[register.key] = register.type === "bitfield" ? raw : fromRawRegisterValue(register, raw);
    }
    return decoded;
  }

  private decodeRegisterValues(cmd: number, payload: Uint8Array): Record<string, number> {
    const frame = `0x${cmd.toString(16).toUpperCase().padStart(2, "0")}`;
    const decoded: Record<string, number> = {};
    for (const register of this.registers) {
      if (register.rx_frame !== frame || register.rx_offset === undefined) {
        continue;
      }
      const width = registerWidth(register.type);
      if (register.rx_offset + width > payload.length) {
        continue;
      }
      const raw = readLittleEndian(payload, register.rx_offset, width, register.type.startsWith("i"));
      decoded[register.key] = register.type === "bitfield" ? raw : fromRawRegisterValue(register, raw);
    }
    return decoded;
  }

  private pushError(error: string): void {
    this.update({ errors: [...this.snapshotValue.errors, error] });
  }

  private pushLog(entry: RawLogEntry): void {
    if (entry.direction === "tx" && entry.bytes.length > 0) {
      this.lastTx = { ...entry, bytes: new Uint8Array(entry.bytes) };
    }
    this.update({ log: [...this.snapshotValue.log, entry].slice(-LOG_LIMIT) });
  }

  private checksumFailureNote(frame: ReturnType<typeof decodeFrame>): string {
    const expected = frame.checksumExpected === null ? "--" : formatWord(frame.checksumExpected);
    const actual = frame.checksumActual === null ? "--" : formatWord(frame.checksumActual);
    const cmd = formatByte(frame.cmd);
    const lastTx = this.lastTx
      ? `${bytesToHex(this.lastTx.bytes)} ${Math.max(0, this.now() - this.lastTx.at)}ms ago`
      : "none";
    return `checksum failure len=${frame.length} cmd=${cmd} family=${frame.family} expected=${expected} actual=${actual} lastTx=${lastTx}`;
  }

  private update(patch: Partial<ControllerSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch };
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function registerWidth(type: RegisterMeta["type"]): number {
  if (type === "u8" || type === "i8" || type === "enum") {
    return 1;
  }
  if (type === "u32" || type === "i32") {
    return 4;
  }
  return 2;
}

function readLittleEndian(bytes: Uint8Array, offset: number, width: number, signed: boolean): number {
  let value = 0;
  for (let i = 0; i < width; i += 1) {
    value += bytes[offset + i] * 2 ** (8 * i);
  }
  if (!signed) {
    return value;
  }
  const fullScale = 2 ** (width * 8);
  const signBit = fullScale / 2;
  return value >= signBit ? value - fullScale : value;
}

function readHebRawValue(words: Array<number | null>, offset: number, type: RegisterMeta["type"]): number | null {
  const width = registerWidth(type);
  const wordCount = Math.ceil(width / 2);
  if (offset + wordCount > words.length) {
    return null;
  }
  let raw = 0;
  for (let index = 0; index < wordCount; index += 1) {
    const word = words[offset + index];
    if (word === null) {
      return null;
    }
    raw += (word & 0xffff) * 2 ** (16 * index);
  }
  if (width === 1) {
    raw &= 0xff;
  }
  if (!type.startsWith("i")) {
    return raw;
  }
  const bits = width * 8;
  const fullScale = 2 ** bits;
  const signBit = fullScale / 2;
  return raw >= signBit ? raw - fullScale : raw;
}

function structuredCloneSnapshot(snapshot: ControllerSnapshot): ControllerSnapshot {
  return {
    ...snapshot,
    telemetry: { ...snapshot.telemetry },
    registerValues: { ...snapshot.registerValues },
    backup: {
      ...snapshot.backup,
      values: { ...snapshot.backup.values },
      heb: {
        ...snapshot.backup.heb,
        dump: {
          mainWords: [...snapshot.backup.heb.dump.mainWords],
          extendedWords: [...snapshot.backup.heb.dump.extendedWords],
        },
      },
    },
    log: snapshot.log.map((entry) => ({ ...entry, bytes: new Uint8Array(entry.bytes) })),
    deviceInventory: snapshot.deviceInventory
      ? {
          ...snapshot.deviceInventory,
          services: snapshot.deviceInventory.services.map((service) => ({
            ...service,
            characteristics: service.characteristics.map((characteristic) => ({
              ...characteristic,
              properties: { ...characteristic.properties },
            })),
          })),
        }
      : null,
    errors: [...snapshot.errors],
  };
}

function emptyHebBackup(): BackupState["heb"] {
  return {
    requestedAt: null,
    completedAt: null,
    mainWordsReceived: 0,
    extendedWordsReceived: 0,
    dump: createEmptyHebDump(),
  };
}

function countWords(words: Array<number | null>): number {
  return words.filter((word) => word !== null).length;
}

function formatByte(value: number): string {
  return `0x${value.toString(16).padStart(2, "0")}`;
}

function formatWord(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

function isBackupPayload(value: unknown): value is { schema: string; values: Record<string, number | null> } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as { schema?: unknown; values?: unknown };
  return payload.schema === "fardriver-backup/v1" && Boolean(payload.values) && typeof payload.values === "object";
}
