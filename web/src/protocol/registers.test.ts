import { allRegisters, fromRawRegisterValue, registerByKey, registerGroups, toRawRegisterValue, validateRegisterValue } from "./registers";

it("loads the full register table", () => {
  expect(allRegisters()).toHaveLength(110);
});

it("groups registers by protocol group", () => {
  const groups = registerGroups().map((group) => group.group);
  expect(groups).toEqual(expect.arrayContaining(["motor", "battery", "limits", "throttle"]));
});

it("validates register min and max values", () => {
  const ratedVoltage = registerByKey("rated_voltage");
  expect(ratedVoltage).toBeDefined();
  expect(validateRegisterValue(ratedVoltage!, -1)).toContain("at least");
  expect(validateRegisterValue(ratedVoltage!, 7000)).toContain("at most");
  expect(validateRegisterValue(ratedVoltage!, 48)).toBeNull();
});

it("round-trips scaled display values through raw register values", () => {
  const ratedVoltage = registerByKey("rated_voltage");
  expect(ratedVoltage).toBeDefined();
  expect(toRawRegisterValue(ratedVoltage!, 48)).toBe(480);
  expect(fromRawRegisterValue(ratedVoltage!, 480)).toBe(48);
});
