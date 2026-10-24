export type VehicleProfile = {
  id: string;
  label: string;
  vehicle: string;
  motor: string;
  controller: string;
  battery: {
    voltage: number;
    packAh: number;
    packCount: number;
    totalAh: number;
    wh: number;
  };
  power: {
    baselineLineCurrentA: number;
    recommendedMaxLineCurrentA: number;
    uiMaxLineCurrentA: number;
    supplierMaxLineCurrentA: number | null;
    baselinePhaseCurrentA: number;
    motorPeakPowerKw: number | null;
    note: string;
  };
  expectedSettings: Record<string, number>;
};

export const vehicleProfiles: VehicleProfile[] = [
  {
    id: "generic-fardriver",
    label: "Generic FarDriver",
    vehicle: "Unknown vehicle",
    motor: "Unknown motor",
    controller: "FarDriver",
    battery: {
      voltage: 0,
      packAh: 0,
      packCount: 0,
      totalAh: 0,
      wh: 0,
    },
    power: {
      baselineLineCurrentA: 0,
      recommendedMaxLineCurrentA: 0,
      uiMaxLineCurrentA: 0,
      supplierMaxLineCurrentA: null,
      baselinePhaseCurrentA: 0,
      motorPeakPowerKw: null,
      note: "No vehicle-specific current envelope is defined.",
    },
    expectedSettings: {},
  },
  {
    id: "segway-e125s-stock-fardriver-72210",
    label: "Segway E125S stock + FarDriver 72210",
    vehicle: "Segway E125S",
    motor: "Stock QS rear hub motor",
    controller: "FarDriver 72210",
    battery: {
      voltage: 48,
      packAh: 30,
      packCount: 2,
      totalAh: 60,
      wh: 2880,
    },
    power: {
      baselineLineCurrentA: 60,
      recommendedMaxLineCurrentA: 70,
      uiMaxLineCurrentA: 80,
      supplierMaxLineCurrentA: 90,
      baselinePhaseCurrentA: 180,
      motorPeakPowerKw: 3.5,
      note:
        "70 A is the current recommended ceiling for the stock dual-battery profile. 80 A remains available as a short-duration sport ceiling, while 90 A is recorded only as the supplier-stated dual-pack maximum and is not exposed by the quick-setup slider.",
    },
    expectedSettings: {
      rated_voltage: 48,
      battery_rated_capacity: 60,
      max_line_current: 60,
      max_phase_current: 180,
    },
  },
];

export function expectedValueForRegister(profile: VehicleProfile, registerKey: string): number | null {
  return profile.expectedSettings[registerKey] ?? null;
}
