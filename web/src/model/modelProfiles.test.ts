import { vehicleProfiles, expectedValueForRegister } from "./modelProfiles";

it("includes the stock Segway E125S with FarDriver 72450 profile", () => {
  const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-fardriver-72450");

  expect(profile).toMatchObject({
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
  });
});

it("maps known profile expectations to register keys", () => {
  const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-fardriver-72450")!;

  expect(expectedValueForRegister(profile, "rated_voltage")).toBe(48);
  expect(expectedValueForRegister(profile, "battery_rated_capacity")).toBe(60);
  expect(expectedValueForRegister(profile, "unknown")).toBeNull();
});
