import telemetryJson from "@protocol-data/telemetry.json";
import type { DecodedFrame } from "./frame";

export type TelemetryType = "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "bitfield" | "enum";

export type TelemetryMeta = {
  frame: string;
  offset: number;
  key: string;
  name: string;
  type: TelemetryType;
  scale: number;
  unit: string;
  group: string;
  enum: Record<string, string> | null;
  explain: string;
  confidence: "high" | "medium" | "low";
  source: string[];
  notes?: string;
};

const TELEMETRY = telemetryJson as TelemetryMeta[];

export const FLASH_READ_ADDR = [
  226, 232, 238, 0, 6, 12, 18, 226, 232, 238, 24, 30, 36, 42, 226, 232, 238,
  48, 93, 99, 105, 226, 232, 238, 124, 130, 136, 142, 226, 232, 238, 148, 154,
  160, 166, 226, 232, 238, 172, 178, 184, 190, 226, 232, 238, 196, 202, 208,
  226, 232, 238, 214, 220, 244, 250,
];

const TYPE_WIDTH: Record<TelemetryType, number> = {
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  bitfield: 2,
  enum: 1,
};

const SIGNED_TYPES = new Set<TelemetryType>(["i8", "i16", "i32"]);

export function allTelemetryFields(): TelemetryMeta[] {
  return [...TELEMETRY].sort((a, b) => a.frame.localeCompare(b.frame) || a.offset - b.offset);
}

export function canonicalTelemetryCmd(cmd: number): number {
  const index = cmd & 0x7f;
  if (index >= FLASH_READ_ADDR.length) {
    return cmd;
  }
  const logicalId = FLASH_READ_ADDR[index];
  const canonicalIndex = FLASH_READ_ADDR.indexOf(logicalId);
  return 0x80 | canonicalIndex;
}

export function decodeTelemetry(frame: DecodedFrame): Record<string, number> {
  if (!frame.checksumOk || frame.family !== "telemetry") {
    return {};
  }

  const canonicalFrame = `0x${canonicalTelemetryCmd(frame.cmd)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0")}`;
  const fields = TELEMETRY.filter((field) => field.frame === canonicalFrame);
  const decoded: Record<string, number> = {};

  for (const field of fields) {
    const width = TYPE_WIDTH[field.type];
    if (field.offset + width > frame.payload.length) {
      continue;
    }
    const raw = readLittleEndian(frame.payload, field.offset, width, SIGNED_TYPES.has(field.type));
    decoded[field.key] = field.type === "bitfield" ? raw : raw * field.scale;
  }

  return decoded;
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
