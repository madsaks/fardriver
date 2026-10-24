import registersJson from "@protocol-data/registers.json";

export type RegisterType = "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "bitfield" | "enum";

export type RegisterMeta = {
  addr: number;
  key: string;
  name: string;
  type: RegisterType;
  scale: number;
  unit: string;
  min: number;
  max: number;
  access: "r" | "rw";
  group: string;
  enum: Record<string, string> | null;
  explain: string;
  confidence: "high" | "medium" | "low";
  source: string[];
  notes?: string;
  rx_frame?: string;
  rx_offset?: number;
};

const REGISTERS = registersJson as RegisterMeta[];

export function allRegisters(): RegisterMeta[] {
  return [...REGISTERS].sort((a, b) => a.addr - b.addr);
}

export function registerGroups(): Array<{ group: string; registers: RegisterMeta[] }> {
  const groups = new Map<string, RegisterMeta[]>();
  for (const register of allRegisters()) {
    const entries = groups.get(register.group) ?? [];
    entries.push(register);
    groups.set(register.group, entries);
  }
  return Array.from(groups, ([group, registers]) => ({ group, registers })).sort((a, b) =>
    a.group.localeCompare(b.group),
  );
}

export function validateRegisterValue(register: RegisterMeta, displayValue: number): string | null {
  if (!Number.isFinite(displayValue)) {
    return "Enter a numeric value.";
  }
  if (displayValue < register.min) {
    return `Value must be at least ${register.min}${register.unit ? ` ${register.unit}` : ""}.`;
  }
  if (displayValue > register.max) {
    return `Value must be at most ${register.max}${register.unit ? ` ${register.unit}` : ""}.`;
  }
  return null;
}

export function toRawRegisterValue(register: RegisterMeta, displayValue: number): number {
  return Math.round(displayValue / register.scale);
}

export function fromRawRegisterValue(register: RegisterMeta, rawValue: number): number {
  return rawValue * register.scale;
}

export function registerByKey(key: string): RegisterMeta | undefined {
  return REGISTERS.find((register) => register.key === key);
}
