import {
  FARDIVER_CHARACTERISTIC_UUID,
  FARDIVER_SERVICE_UUID,
  FarDriverBleConnection,
  type BluetoothLike,
} from "./connection";
import { RX_FRAME_BUS_VOLTAGE, RX_FRAME_FAULT_BITS } from "@/test/fixtures";
import { hexToBytes } from "@/protocol/hex";

class FakeCharacteristic {
  listener: ((event: { target: { value: DataView } }) => void) | null = null;
  writes: Uint8Array[] = [];

  async startNotifications() {
    return this;
  }

  async writeValue(bytes: Uint8Array) {
    this.writes.push(bytes);
  }

  addEventListener(_type: "characteristicvaluechanged", listener: (event: { target: { value: DataView } }) => void) {
    this.listener = listener;
  }

  emit(bytes: Uint8Array) {
    this.listener?.({ target: { value: new DataView(bytes.buffer) } });
  }
}

function fakeBluetooth() {
  const characteristic = new FakeCharacteristic();
  const calls: { requestOptions?: unknown; serviceUuid?: string; characteristicUuid?: string } = {};
  const bluetooth: BluetoothLike = {
  async requestDevice(options) {
      calls.requestOptions = options;
      return {
        gatt: {
          async connect() {
            return {
              async getPrimaryService(uuid: string) {
                calls.serviceUuid = uuid;
                return {
                  async getCharacteristic(characteristicUuid: string) {
                    calls.characteristicUuid = characteristicUuid;
                    return characteristic;
                  },
                };
              },
            };
          },
        },
      };
    },
  };
  return { bluetooth, calls, characteristic };
}

function fakeExplorerBluetooth() {
  const calls: { requestOptions?: unknown } = {};
  const bluetooth: BluetoothLike = {
    async requestDevice(options) {
      calls.requestOptions = options;
      return {
        id: "segway-test-id",
        name: "Segway Controller",
        gatt: {
          async connect() {
            return {
              async getPrimaryService() {
                throw new Error("not used in explorer mode");
              },
              async getPrimaryServices() {
                return [
                  {
                    uuid: "battery_service",
                    async getCharacteristic() {
                      throw new Error("not used in inventory");
                    },
                    async getCharacteristics() {
                      return [
                        {
                          uuid: "battery_level",
                          properties: { read: true, notify: true },
                          async startNotifications() {
                            throw new Error("not used in inventory");
                          },
                          async writeValue() {
                            throw new Error("not used in inventory");
                          },
                          addEventListener() {
                            throw new Error("not used in inventory");
                          },
                        },
                      ];
                    },
                  },
                ];
              },
            };
          },
        },
      };
    },
  };
  return { bluetooth, calls };
}

it("reports unsupported browsers", async () => {
  const connection = new FarDriverBleConnection({});
  const states: string[] = [];
  connection.onState((state) => states.push(state));
  expect(connection.isSupported()).toBe(false);
  await connection.connect();
  expect(states).toContain("unsupported");
});

it("requests the FarDriver device filters and UUIDs", async () => {
  const { bluetooth, calls } = fakeBluetooth();
  const connection = new FarDriverBleConnection({ bluetooth });
  await connection.connect();
  expect(calls.requestOptions).toMatchObject({
    filters: [{ namePrefix: "YUANQU" }, { namePrefix: "CONTROL" }, { namePrefix: "BMS" }],
    optionalServices: [FARDIVER_SERVICE_UUID],
  });
  expect(calls.serviceUuid).toBe(FARDIVER_SERVICE_UUID);
  expect(calls.characteristicUuid).toBe(FARDIVER_CHARACTERISTIC_UUID);
});

it("emits notification bytes to frame listeners", async () => {
  const { bluetooth, characteristic } = fakeBluetooth();
  const connection = new FarDriverBleConnection({ bluetooth, now: () => 123 });
  const frames: Uint8Array[] = [];
  const logs: Array<{ direction: string; note: string }> = [];
  connection.onFrame((bytes) => frames.push(bytes));
  connection.onLog((entry) => logs.push({ direction: entry.direction, note: entry.note }));
  await connection.connect();

  characteristic.emit(Uint8Array.from([0xaa, 0x80]));

  expect(Array.from(frames[0])).toEqual([0xaa, 0x80]);
  expect(logs).toContainEqual({ direction: "rx", note: "notification" });
});

it("splits bundled 32-byte notifications into 16-byte FarDriver frames", async () => {
  const { bluetooth, characteristic } = fakeBluetooth();
  const connection = new FarDriverBleConnection({ bluetooth, now: () => 123 });
  const frames: Uint8Array[] = [];
  connection.onFrame((bytes) => frames.push(bytes));
  await connection.connect();
  const first = hexToBytes(RX_FRAME_BUS_VOLTAGE);
  const second = hexToBytes(RX_FRAME_FAULT_BITS);

  characteristic.emit(Uint8Array.from([...first, ...second]));

  expect(frames.map((frame) => Array.from(frame))).toEqual([Array.from(first), Array.from(second)]);
});

it("writes and logs outgoing bytes", async () => {
  const { bluetooth, characteristic } = fakeBluetooth();
  const connection = new FarDriverBleConnection({ bluetooth, now: () => 456 });
  const logs: Array<{ direction: string; bytes: number[] }> = [];
  connection.onLog((entry) => logs.push({ direction: entry.direction, bytes: Array.from(entry.bytes) }));
  await connection.connect();

  await connection.write(Uint8Array.from([0xaa, 0xc4]));

  expect(characteristic.writes.map((bytes) => Array.from(bytes))).toEqual([[0xaa, 0xc4]]);
  expect(logs).toContainEqual({ direction: "tx", bytes: [0xaa, 0xc4] });
});

it("connects in Segway explorer mode and emits a GATT inventory", async () => {
  const { bluetooth, calls } = fakeExplorerBluetooth();
  const connection = new FarDriverBleConnection({ bluetooth });
  const inventories: unknown[] = [];
  connection.onInventory((inventory) => inventories.push(inventory));

  await connection.connect("segway-explore");

  expect(calls.requestOptions).toMatchObject({
    acceptAllDevices: true,
  });
  expect(inventories).toEqual([
    {
      profile: "segway-explore",
      id: "segway-test-id",
      name: "Segway Controller",
      services: [
        {
          uuid: "battery_service",
          characteristics: [
            {
              uuid: "battery_level",
              properties: { read: true, notify: true },
            },
          ],
        },
      ],
    },
  ]);
});
