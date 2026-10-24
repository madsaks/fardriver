import { fireEvent, render, screen } from "@testing-library/react";
import { vehicleProfiles } from "@/model/modelProfiles";
import { QuickSetup } from "./QuickSetup";

const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-stock-fardriver-72210")!;

it("shows the E125S power envelope and keeps writes locked until backup and arming", () => {
  render(
    <QuickSetup
      profile={profile}
      values={{}}
      connected
      writeMode="read-only"
      backupRequired
      onRunHebBackup={() => undefined}
      onArmWrites={() => undefined}
      onWrite={() => undefined}
    />,
  );

  expect(screen.getByText("Recommended max 70 A")).toBeInTheDocument();
  expect(screen.getByLabelText("Maximum line current")).toHaveAttribute("max", "80");
  expect(screen.getByRole("button", { name: "Write power limit" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Write acceleration" })).toBeDisabled();
});

it("writes one quick control at a time when the session is ready", () => {
  const writes: Array<[string, number]> = [];
  render(
    <QuickSetup
      profile={profile}
      values={{ max_line_current: 60, max_acceleration: 170 }}
      connected
      writeMode="armed"
      backupRequired={false}
      onRunHebBackup={() => undefined}
      onArmWrites={() => undefined}
      onWrite={(key, value) => writes.push([key, value])}
    />,
  );

  fireEvent.change(screen.getByLabelText("Maximum line current"), { target: { value: "70" } });
  fireEvent.click(screen.getByRole("button", { name: "Write power limit" }));
  fireEvent.change(screen.getByLabelText("Maximum acceleration"), { target: { value: "224" } });
  fireEvent.click(screen.getByRole("button", { name: "Write acceleration" }));

  expect(writes).toEqual([
    ["max_line_current", 70],
    ["max_acceleration", 224],
  ]);
});
