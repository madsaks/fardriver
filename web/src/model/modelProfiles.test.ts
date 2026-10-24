import { vehicleProfiles, expectedValueForRegister } from "./modelProfiles";

it("includes the stock Segway E125S with FarDriver 72210 profile", () => {
  const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-stock-fardriver-72210");

  expect(profile).toMatchObject({
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
    },
  });
});

it("maps known profile expectations to register keys", () => {
  const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-stock-fardriver-72210")!;

  expect(expectedValueForRegister(profile, "rated_voltage")).toBe(48);
  expect(expectedValueForRegister(profile, "battery_rated_capacity")).toBe(60);
  expect(expectedValueForRegister(profile, "max_line_current")).toBe(60);
  expect(expectedValueForRegister(profile, "max_phase_current")).toBe(180);
  expect(expectedValueForRegister(profile, "unknown")).toBeNull();
});
