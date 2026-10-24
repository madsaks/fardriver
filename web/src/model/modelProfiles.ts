export type VehicleProfile = {
  id: string;
  label: string;
  vehicle: string;
  controller: string;
  battery: {
    voltage: number;
    packAh: number;
    packCount: number;
    totalAh: number;
    wh: number;
  };
  expectedSettings: Record<string, number>;
};

export const vehicleProfiles: VehicleProfile[] = [
  {
    id: "generic-fardriver",
    label: "Generic FarDriver",
    vehicle: "Unknown vehicle",
    controller: "FarDriver",
    battery: {
      voltage: 0,
      packAh: 0,
      packCount: 0,
      totalAh: 0,
      wh: 0,
    },
    expectedSettings: {},
  },
  {
    id: "segway-e125s-fardriver-72450",
    label: "Segway E125S stock + FarDriver 72450",
    vehicle: "Segway E125S",
    controller: "FarDriver 72450",
    battery: {
      voltage: 48,
      packAh: 30,
      packCount: 2,
      totalAh: 60,
      wh: 2880,
    },
    expectedSettings: {
      rated_voltage: 48,
      battery_rated_capacity: 60,
    },
  },
];

export function expectedValueForRegister(profile: VehicleProfile, registerKey: string): number | null {
  return profile.expectedSettings[registerKey] ?? null;
}
