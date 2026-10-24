import { decodeFrame } from "./frame";

export const HEB_MAIN_WORDS = 156;
export const HEB_EXTENDED_WORDS = 192;
export const HEB_TOTAL_BYTES = (HEB_MAIN_WORDS + HEB_EXTENDED_WORDS) * 2;

export type HebSection = "main" | "extended";

export type HebDumpWords = {
  mainWords: Array<number | null>;
  extendedWords: Array<number | null>;
};

export type HebFrameWords = {
  section: HebSection;
  offset: number;
  words: number[];
};

const MAIN_FRAME_ADDR_TO_OFFSET = new Map<number, number>(
  [
    0, 6, 12, 18, 24, 30, 36, 42, 48, 99, 105, 124, 130, 136, 142, 148, 154,
    160, 166, 172, 178, 184, 190, 196, 202, 208,
  ].map((addr, index) => [addr, index * 6]),
);

const FLASH_READ_ADDR = [
  226, 232, 238, 0, 6, 12, 18, 226, 232, 238, 24, 30, 36, 42, 226, 232, 238,
  48, 93, 99, 105, 226, 232, 238, 124, 130, 136, 142, 226, 232, 238, 148, 154,
  160, 166, 226, 232, 238, 172, 178, 184, 190, 226, 232, 238, 196, 202, 208,
  226, 232, 238, 214, 220, 244, 250,
];

const MAIN_SETTING_RANGES = [
  { start: 0, end: 53, offset: 0 },
  { start: 99, end: 110, offset: 54 },
  { start: 124, end: 213, offset: 66 },
];

export function createEmptyHebDump(): HebDumpWords {
  return {
    mainWords: Array(HEB_MAIN_WORDS).fill(null),
    extendedWords: Array(HEB_EXTENDED_WORDS).fill(null),
  };
}

export function hebDumpReadAddresses(): number[] {
  return [
    ...Array.from(MAIN_FRAME_ADDR_TO_OFFSET.keys()),
    ...Array.from({ length: 32 }, (_, index) => index + 56),
  ];
}

export function hebMainWordOffsetForAddress(address: number): number | null {
  for (const range of MAIN_SETTING_RANGES) {
    if (address >= range.start && address <= range.end) {
      return range.offset + (address - range.start);
    }
  }
  return null;
}

export function decodeHebWordsFromFrame(bytes: Uint8Array): HebFrameWords | null {
  const decoded = decodeFrame(bytes);
  if (!decoded.checksumOk || decoded.family !== "telemetry") {
    return null;
  }

  const index = decoded.cmd & 0x7f;
  const words = readSixWords(decoded.payload);
  if (index >= 56 && index <= 87) {
    return {
      section: "extended",
      offset: (index - 56) * 6,
      words,
    };
  }

  const logicalAddr = FLASH_READ_ADDR[index];
  const mainOffset = MAIN_FRAME_ADDR_TO_OFFSET.get(logicalAddr);
  if (mainOffset === undefined) {
    return null;
  }
  return {
    section: "main",
    offset: mainOffset,
    words,
  };
}

export function applyHebFrame(dump: HebDumpWords, frame: HebFrameWords): HebDumpWords {
  const next = {
    mainWords: [...dump.mainWords],
    extendedWords: [...dump.extendedWords],
  };
  const target = frame.section === "main" ? next.mainWords : next.extendedWords;
  for (let index = 0; index < frame.words.length; index += 1) {
    const wordIndex = frame.offset + index;
    if (wordIndex < target.length) {
      target[wordIndex] = frame.words[index] & 0xffff;
    }
  }
  return next;
}

export function isHebDumpComplete(dump: HebDumpWords): boolean {
  return dump.mainWords.length === HEB_MAIN_WORDS &&
    dump.extendedWords.length === HEB_EXTENDED_WORDS &&
    dump.mainWords.every((word) => word !== null) &&
    dump.extendedWords.every((word) => word !== null);
}

export function buildHebFile(dump: HebDumpWords): Uint8Array {
  if (!isHebDumpComplete(dump)) {
    throw new Error("Cannot export incomplete HEB dump.");
  }
  const bytes = new Uint8Array(HEB_TOTAL_BYTES);
  writeWords(bytes, 0, dump.mainWords);
  writeWords(bytes, HEB_MAIN_WORDS * 2, dump.extendedWords);
  return bytes;
}

function readSixWords(payload: Uint8Array): number[] {
  const words: number[] = [];
  for (let offset = 0; offset < 12; offset += 2) {
    words.push(payload[offset] | (payload[offset + 1] << 8));
  }
  return words;
}

function writeWords(bytes: Uint8Array, byteOffset: number, words: Array<number | null>): void {
  for (let index = 0; index < words.length; index += 1) {
    const value = words[index];
    if (value === null) {
      throw new Error("Cannot export incomplete HEB dump.");
    }
    bytes[byteOffset + index * 2] = value & 0xff;
    bytes[byteOffset + index * 2 + 1] = (value >> 8) & 0xff;
  }
}
