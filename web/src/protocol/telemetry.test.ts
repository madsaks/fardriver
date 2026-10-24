import {
  RX_FRAME_BUS_VOLTAGE,
  RX_FRAME_FAULT_BITS,
  RX_FRAME_ID226,
  RX_FRAME_ID226_REPEAT_INDEX_7,
  RX_FRAME_NO_TELEMETRY_ID,
} from "@/test/fixtures";
import { decodeFrame } from "./frame";
import { hexToBytes } from "./hex";
import { decodeTelemetry } from "./telemetry";

it("decodes scaled telemetry values", () => {
  const frame = decodeFrame(hexToBytes(RX_FRAME_BUS_VOLTAGE));
  expect(decodeTelemetry(frame).bus_voltage).toBe(72);
});

it("returns bitfield values as raw integers", () => {
  const frame = decodeFrame(hexToBytes(RX_FRAME_FAULT_BITS));
  const value = decodeTelemetry(frame).fault_status_word;
  expect(value).toBe(257);
  expect(Number.isInteger(value)).toBe(true);
});

it("normalizes repeated telemetry command bytes", () => {
  const canonical = decodeTelemetry(decodeFrame(hexToBytes(RX_FRAME_ID226)));
  const repeat = decodeTelemetry(decodeFrame(hexToBytes(RX_FRAME_ID226_REPEAT_INDEX_7)));
  expect(repeat).toEqual(canonical);
  expect(canonical).toMatchObject({
    gear_status_flags: 33029,
    fault_status_word: 1,
    modulation: 0.5,
    motor_rpm: 1500,
  });
});

it("returns no values for frames without telemetry metadata", () => {
  const frame = decodeFrame(hexToBytes(RX_FRAME_NO_TELEMETRY_ID));
  expect(decodeTelemetry(frame)).toEqual({});
});
