import { fireEvent, render, screen } from "@testing-library/react";
import { vehicleProfiles } from "@/model/modelProfiles";
import { registerGroups } from "@/protocol/registers";
import { Settings } from "./Settings";

it("renders grouped registers with friendly summaries and technical details disclosures", () => {
  const groups = registerGroups();
  render(<Settings groups={groups} values={{}} writeMode="read-only" onWrite={() => undefined} />);
  expect(screen.getByRole("button", { name: "motor" })).toBeInTheDocument();
  expect(screen.getAllByText(/Needs bike validation/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Current controller setting for/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Original app limit/i).length).toBeGreaterThan(0);
  const infoButton = screen.getByRole("button", { name: `Technical details for ${groups[0].registers[0].name}` });
  expect(infoButton).toBeInTheDocument();
  expect(screen.queryByText(groups[0].registers[0].explain)).not.toBeInTheDocument();
  fireEvent.click(infoButton);
  expect(screen.getByText(groups[0].registers[0].explain)).toBeInTheDocument();
});

it("disables editing in read-only mode", () => {
  render(<Settings groups={registerGroups()} values={{ rated_voltage: 48 }} writeMode="read-only" onWrite={() => undefined} />);
  expect(screen.getAllByRole("spinbutton")[0]).toBeDisabled();
});

it("shows validation errors before writing", () => {
  render(<Settings groups={registerGroups()} values={{ rated_voltage: 48 }} writeMode="armed" onWrite={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "battery" }));
  const input = screen.getByLabelText("Battery rated voltage value");
  fireEvent.change(input, { target: { value: "7000" } });
  expect(screen.getByText(/at most/i)).toBeInTheDocument();
});

it("shows selected model expected values beside current settings", () => {
  const profile = vehicleProfiles.find((entry) => entry.id === "segway-e125s-fardriver-72450")!;

  render(
    <Settings
      groups={registerGroups()}
      values={{ rated_voltage: 72, battery_rated_capacity: 20 }}
      writeMode="read-only"
      modelProfile={profile}
      onWrite={() => undefined}
    />,
  );

  expect(screen.getByText("Expected for model: 48 V")).toBeInTheDocument();
  expect(screen.getAllByText("Current differs from selected model").length).toBeGreaterThan(0);
});
