export const HEADER = 0xaa;
export const CMD_WRITE_MASK = 0xc0;
export const RX_FRAME_LEN = 16;

const CRC_LO = Uint8Array.from([
  0, 192, 193, 1, 195, 3, 2, 194, 198, 6, 7, 199, 5, 197, 196, 4, 204, 12,
  13, 205, 15, 207, 206, 14, 10, 202, 203, 11, 201, 9, 8, 200, 216, 24, 25,
  217, 27, 219, 218, 26, 30, 222, 223, 31, 221, 29, 28, 220, 20, 212, 213,
  21, 215, 23, 22, 214, 210, 18, 19, 211, 17, 209, 208, 16, 240, 48, 49,
  241, 51, 243, 242, 50, 54, 246, 247, 55, 245, 53, 52, 244, 60, 252, 253,
  61, 255, 63, 62, 254, 250, 58, 59, 251, 57, 249, 248, 56, 40, 232, 233,
  41, 235, 43, 42, 234, 238, 46, 47, 239, 45, 237, 236, 44, 228, 36, 37,
  229, 39, 231, 230, 38, 34, 226, 227, 35, 225, 33, 32, 224, 160, 96, 97,
  161, 99, 163, 162, 98, 102, 166, 167, 103, 165, 101, 100, 164, 108, 172,
  173, 109, 175, 111, 110, 174, 170, 106, 107, 171, 105, 169, 168, 104,
  120, 184, 185, 121, 187, 123, 122, 186, 190, 126, 127, 191, 125, 189,
  188, 124, 180, 116, 117, 181, 119, 183, 182, 118, 114, 178, 179, 115,
  177, 113, 112, 176, 80, 144, 145, 81, 147, 83, 82, 146, 150, 86, 87,
  151, 85, 149, 148, 84, 156, 92, 93, 157, 95, 159, 158, 94, 90, 154, 155,
  91, 153, 89, 88, 152, 136, 72, 73, 137, 75, 139, 138, 74, 78, 142, 143,
  79, 141, 77, 76, 140, 68, 132, 133, 69, 135, 71, 70, 134, 130, 66, 67,
  131, 65, 129, 128, 64,
]);

const CRC_HI = Uint8Array.from([
  0, 193, 129, 64, 1, 192, 128, 65, 1, 192, 128, 65, 0, 193, 129, 64, 1,
  192, 128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
  128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129,
  64, 1, 192, 128, 65, 1, 192, 128, 65, 0, 193, 129, 64, 1, 192, 128, 65,
  0, 193, 129, 64, 0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129, 64, 1,
  192, 128, 65, 1, 192, 128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1, 192,
  128, 65, 1, 192, 128, 65, 0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129,
  64, 0, 193, 129, 64, 1, 192, 128, 65, 1, 192, 128, 65, 0, 193, 129, 64,
  0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129, 64, 1, 192, 128, 65, 1,
  192, 128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1, 192, 128, 65, 1, 192,
  128, 65, 0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129, 64, 0, 193, 129,
  64, 1, 192, 128, 65, 0, 193, 129, 64, 1, 192, 128, 65, 1, 192, 128, 65,
  0, 193, 129, 64, 1, 192, 128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1,
  192, 128, 65, 1, 192, 128, 65, 0, 193, 129, 64, 0, 193, 129, 64, 1, 192,
  128, 65, 0, 193, 129, 64, 1, 192, 128, 65, 1, 192, 128, 65, 0, 193, 129,
  64,
]);

const CRC_INIT_B = 0x3c;
const CRC_INIT_B2 = 0x7f;

export type FrameFamily = "telemetry" | "control" | "invalid";

export type DecodedFrame = {
  cmd: number;
  addr: null;
  payload: Uint8Array;
  checksumOk: boolean;
  checksumExpected: number | null;
  checksumActual: number | null;
  family: FrameFamily;
  length: number;
};

export function checksum(payload: Uint8Array): number {
  let b = CRC_INIT_B;
  let b2 = CRC_INIT_B2;
  for (const byte of payload) {
    const idx = (b ^ byte) & 0xff;
    b = (b2 ^ CRC_HI[idx]) & 0xff;
    b2 = CRC_LO[idx];
  }
  return (b << 8) | b2;
}

function appendChecksum(body: number[]): Uint8Array {
  const crc = checksum(Uint8Array.from(body));
  return Uint8Array.from([...body, (crc >> 8) & 0xff, crc & 0xff]);
}

function additiveChecksum(body: Uint8Array): number {
  let sum = 0;
  for (const byte of body) {
    sum = (sum + byte) & 0xffff;
  }
  return sum;
}

export function encodeRead(addr: number): Uint8Array {
  const normalizedAddr = addr & 0xff;
  return appendChecksum([HEADER, CMD_WRITE_MASK | 4, normalizedAddr, normalizedAddr]);
}

export function encodeWrite(addr: number, value: number): Uint8Array {
  const normalizedAddr = addr & 0xff;
  return appendChecksum([
    HEADER,
    CMD_WRITE_MASK | 6,
    normalizedAddr,
    normalizedAddr,
    value & 0xff,
    (value >> 8) & 0xff,
  ]);
}

export function encodeLegacyRequest(mainCommand: number, subCommand: number, value1: number, value2: number): Uint8Array {
  const bytes = Uint8Array.from([
    HEADER,
    mainCommand & 0xff,
    (~mainCommand) & 0xff,
    subCommand & 0xff,
    value1 & 0xff,
    value2 & 0xff,
    0,
    0,
  ]);
  bytes[6] = bytes.slice(0, 6).reduce((sum, byte) => (sum + byte) & 0xff, 0);
  bytes[7] = (~bytes[6]) & 0xff;
  return bytes;
}

export function decodeFrame(frame: Uint8Array): DecodedFrame {
  const cmd = frame.length > 1 ? frame[1] : 0;
  if (frame.length !== RX_FRAME_LEN || frame[0] !== HEADER) {
    return {
      cmd,
      addr: null,
      payload: new Uint8Array(),
      checksumOk: false,
      checksumExpected: null,
      checksumActual: null,
      family: "invalid",
      length: frame.length,
    };
  }

  const body = frame.slice(0, 14);
  const expected = (frame[14] << 8) | frame[15];
  const family: FrameFamily = cmd & 0x80 ? "telemetry" : "control";
  const actual = family === "telemetry" ? checksum(body) : additiveChecksum(body);

  return {
    cmd,
    addr: null,
    payload: frame.slice(2, 14),
    checksumOk: actual === expected,
    checksumExpected: expected,
    checksumActual: actual,
    family,
    length: frame.length,
  };
}
