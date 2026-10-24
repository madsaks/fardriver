import {
  READ_TX,
  RX_FRAME,
  RX_FRAME_INDEX_72,
  RX_FRAME_SERIAL,
  WRITE_TX,
} from "@/test/fixtures";
import { checksum, decodeFrame, encodeLegacyRequest, encodeRead, encodeWrite } from "./frame";
import { hexToBytes } from "./hex";

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

it("encodes official legacy request packets", () => {
  expect(Array.from(encodeLegacyRequest(19, 7, 10, 56))).toEqual([0xaa, 0x13, 0xec, 0x07, 0x0a, 0x38, 0xf2, 0x0d]);
});

it("decodes valid top-bit-set RX frames", () => {
  const decoded = decodeFrame(hexToBytes(RX_FRAME));
  expect(decoded.checksumOk).toBe(true);
  expect(decoded.cmd).toBe(0x80);
  expect(decoded.family).toBe("telemetry");
  expect(decoded.addr).toBe(null);
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
  const decoded = decodeFrame(bad);
  expect(decoded.checksumOk).toBe(false);
  expect(decoded.checksumExpected).not.toBeNull();
  expect(decoded.checksumActual).not.toBeNull();
  expect(decoded.checksumActual).not.toBe(decoded.checksumExpected);
  expect(decoded.length).toBe(16);
});
