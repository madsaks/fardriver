import { checksum, encodeRead } from "./frame";
import {
  HEB_TOTAL_BYTES,
  buildHebFile,
  decodeHebWordsFromFrame,
  hebDumpReadAddresses,
  hebMainWordOffsetForAddress,
  isHebDumpComplete,
} from "./heb";

function rxFrame(cmd: number, words: number[]): Uint8Array {
  const body = [
    0xaa,
    cmd,
    ...words.flatMap((word) => [word & 0xff, (word >> 8) & 0xff]),
  ];
  const crc = checksum(Uint8Array.from(body));
  return Uint8Array.from([...body, (crc >> 8) & 0xff, crc & 0xff]);
}

it("serializes official HEB bytes as 156 main words then 192 extended words", () => {
  const mainWords = Array.from({ length: 156 }, (_, index) => index + 1);
  const extendedWords = Array.from({ length: 192 }, (_, index) => 0x1000 + index);

  const heb = buildHebFile({ mainWords, extendedWords });

  expect(heb).toHaveLength(HEB_TOTAL_BYTES);
  expect(Array.from(heb.slice(0, 8))).toEqual([1, 0, 2, 0, 3, 0, 4, 0]);
  expect(Array.from(heb.slice(312, 320))).toEqual([0, 0x10, 1, 0x10, 2, 0x10, 3, 0x10]);
});

it("maps official response frames into HEB word offsets", () => {
  expect(decodeHebWordsFromFrame(rxFrame(0x83, [1, 2, 3, 4, 5, 6]))).toEqual({
    section: "main",
    offset: 0,
    words: [1, 2, 3, 4, 5, 6],
  });
  expect(decodeHebWordsFromFrame(rxFrame(0xb8, [7, 8, 9, 10, 11, 12]))).toEqual({
    section: "extended",
    offset: 0,
    words: [7, 8, 9, 10, 11, 12],
  });
});

it("requests only read frames and knows when a dump is complete", () => {
  for (const address of hebDumpReadAddresses()) {
    expect(encodeRead(address)[1]).toBe(0xc4);
  }
  expect(isHebDumpComplete({ mainWords: Array(156).fill(1), extendedWords: Array(192).fill(1) })).toBe(true);
  expect(isHebDumpComplete({ mainWords: Array(155).fill(1), extendedWords: Array(192).fill(1) })).toBe(false);
});

it("maps official setting addresses to HEB main-word offsets", () => {
  expect(hebMainWordOffsetForAddress(23)).toBe(23);
  expect(hebMainWordOffsetForAddress(53)).toBe(53);
  expect(hebMainWordOffsetForAddress(99)).toBe(54);
  expect(hebMainWordOffsetForAddress(110)).toBe(65);
  expect(hebMainWordOffsetForAddress(124)).toBe(66);
  expect(hebMainWordOffsetForAddress(213)).toBe(155);
  expect(hebMainWordOffsetForAddress(98)).toBeNull();
});
