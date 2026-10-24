export const FARDIVER_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
export const FARDIVER_CHARACTERISTIC_UUID = "0000ffec-0000-1000-8000-00805f9b34fb";
export const NORDIC_UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const BATTERY_SERVICE_UUID = "battery_service";
export const DEVICE_INFORMATION_SERVICE_UUID = "device_information";

export type BleProfile = "fardriver" | "segway-explore";

export type ConnectionState =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "unsupported"
  | "error";

export type RawFrameDirection = "rx" | "tx";

export type RawLogEntry = {
  at: number;
  direction: RawFrameDirection;
  bytes: Uint8Array;
  note: string;
};

export type DeviceInventory = {
  profile: BleProfile;
  name: string | null;
  id: string | null;
  services: Array<{
    uuid: string;
    characteristics: Array<{
      uuid: string;
      properties: Record<string, boolean>;
    }>;
  }>;
};

export type BluetoothLike = {
  requestDevice(options: BluetoothRequestOptionsLike): Promise<BluetoothDeviceLike>;
};

export type BluetoothRequestOptionsLike = {
  filters?: Array<{ namePrefix: string }>;
  acceptAllDevices?: boolean;
  optionalServices: string[];
};

export type BluetoothDeviceLike = {
  id?: string;
  name?: string;
  gatt?: {
    connect(): Promise<BluetoothRemoteGATTServerLike>;
  };
  addEventListener?(type: "gattserverdisconnected", listener: () => void): void;
};

export type BluetoothRemoteGATTServerLike = {
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTServiceLike>;
  getPrimaryServices?(): Promise<BluetoothRemoteGATTServiceLike[]>;
};

export type BluetoothRemoteGATTServiceLike = {
  uuid?: string;
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
  getCharacteristics?(): Promise<BluetoothRemoteGATTCharacteristicLike[]>;
};

export type BluetoothRemoteGATTCharacteristicLike = {
  uuid?: string;
  properties?: Record<string, boolean>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  writeValue(bytes: Uint8Array): Promise<void>;
  addEventListener(
    type: "characteristicvaluechanged",
    listener: (event: { target: { value?: DataView } }) => void,
  ): void;
};

type Listener<T> = (value: T) => void;

export class FarDriverBleConnection {
  private state: ConnectionState = "idle";
  private characteristic: BluetoothRemoteGATTCharacteristicLike | null = null;
  private readonly frameListeners = new Set<Listener<Uint8Array>>();
  private readonly stateListeners = new Set<Listener<ConnectionState>>();
  private readonly logListeners = new Set<Listener<RawLogEntry>>();
  private readonly inventoryListeners = new Set<Listener<DeviceInventory>>();
  private readonly now: () => number;

  constructor(private readonly options: { bluetooth?: BluetoothLike; now?: () => number }) {
    this.now = options.now ?? (() => Date.now());
  }

  isSupported(): boolean {
    return Boolean(this.options.bluetooth);
  }

  getState(): ConnectionState {
    return this.state;
  }

  async connect(profile: BleProfile = "fardriver"): Promise<void> {
    if (!this.options.bluetooth) {
      this.setState("unsupported");
      return;
    }

    this.setState("requesting");
    try {
      const device = await this.options.bluetooth.requestDevice(requestOptionsFor(profile));
      device.addEventListener?.("gattserverdisconnected", () => {
        this.characteristic = null;
        this.setState("disconnected");
      });

      this.setState("connecting");
      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error("Bluetooth device has no GATT server.");
      }
      await this.emitInventory(profile, device, server);
      if (profile === "segway-explore") {
        this.setState("connected");
        return;
      }
      const service = await server.getPrimaryService(FARDIVER_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(FARDIVER_CHARACTERISTIC_UUID);
      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const value = event.target.value;
        if (!value) {
          return;
        }
        const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        this.emitLog("rx", bytes, "notification");
        this.emitFrames(bytes);
      });
      this.characteristic = await characteristic.startNotifications();
      this.setState("connected");
    } catch (error) {
      this.setState("error");
      const message = error instanceof Error ? error.message : "Bluetooth connection failed.";
      this.emitLog("rx", new Uint8Array(), message);
      throw error;
    }
  }

  disconnect(): void {
    this.characteristic = null;
    this.setState("disconnected");
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      throw new Error("Cannot write before the FarDriver characteristic is connected.");
    }
    await this.characteristic.writeValue(bytes);
    this.emitLog("tx", bytes, "write");
  }

  onFrame(listener: Listener<Uint8Array>): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  onState(listener: Listener<ConnectionState>): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onLog(listener: Listener<RawLogEntry>): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  onInventory(listener: Listener<DeviceInventory>): () => void {
    this.inventoryListeners.add(listener);
    return () => {
      this.inventoryListeners.delete(listener);
    };
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  private emitLog(direction: RawFrameDirection, bytes: Uint8Array, note: string): void {
    const entry = { at: this.now(), direction, bytes, note };
    for (const listener of this.logListeners) {
      listener(entry);
    }
  }

  private emitFrames(bytes: Uint8Array): void {
    for (const frame of splitFarDriverFrames(bytes)) {
      for (const listener of this.frameListeners) {
        listener(frame);
      }
    }
  }

  private async emitInventory(
    profile: BleProfile,
    device: BluetoothDeviceLike,
    server: BluetoothRemoteGATTServerLike,
  ): Promise<void> {
    const services = await inventoryServices(server);
    const inventory: DeviceInventory = {
      profile,
      name: device.name ?? null,
      id: device.id ?? null,
      services,
    };
    this.emitLog("rx", new Uint8Array(), `device inventory: ${services.length} services`);
    for (const listener of this.inventoryListeners) {
      listener(inventory);
    }
  }
}

function splitFarDriverFrames(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length > 16 && bytes.length % 16 === 0) {
    const frames: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.length; offset += 16) {
      if (bytes[offset] !== 0xaa) {
        return [bytes];
      }
      frames.push(bytes.slice(offset, offset + 16));
    }
    return frames;
  }
  return [bytes];
}

function requestOptionsFor(profile: BleProfile): BluetoothRequestOptionsLike {
  if (profile === "segway-explore") {
    return {
      acceptAllDevices: true,
      optionalServices: [
        BATTERY_SERVICE_UUID,
        DEVICE_INFORMATION_SERVICE_UUID,
        FARDIVER_SERVICE_UUID,
        NORDIC_UART_SERVICE_UUID,
      ],
    };
  }
  return {
    filters: [{ namePrefix: "YUANQU" }, { namePrefix: "CONTROL" }, { namePrefix: "BMS" }],
    optionalServices: [FARDIVER_SERVICE_UUID],
  };
}

async function inventoryServices(server: BluetoothRemoteGATTServerLike): Promise<DeviceInventory["services"]> {
  const services = await server.getPrimaryServices?.();
  if (!services) {
    return [];
  }

  const out: DeviceInventory["services"] = [];
  for (const service of services) {
    const characteristics = await service.getCharacteristics?.().catch(() => []);
    out.push({
      uuid: service.uuid ?? "unknown-service",
      characteristics: (characteristics ?? []).map((characteristic) => ({
        uuid: characteristic.uuid ?? "unknown-characteristic",
        properties: characteristic.properties ?? {},
      })),
    });
  }
  return out;
}
