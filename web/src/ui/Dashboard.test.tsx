import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { ConnectionBar } from "./ConnectionBar";

it("renders decoded telemetry metrics", () => {
  render(<Dashboard telemetry={{ bus_voltage: 72, motor_rpm: 1500 }} />);
  expect(screen.getByText("72")).toBeInTheDocument();
  expect(screen.getByText("1500")).toBeInTheDocument();
});

it("renders stable placeholders for missing telemetry", () => {
  render(<Dashboard telemetry={{}} />);
  expect(screen.getAllByText("--").length).toBeGreaterThan(0);
});

it("shows unsupported Web Bluetooth state", () => {
  render(
    <ConnectionBar
      state="unsupported"
      writeMode="read-only"
      backupRequired
      unsupported
      onConnectFarDriver={() => undefined}
      onExploreSegway={() => undefined}
      onDisconnect={() => undefined}
      onArmWrites={() => undefined}
    />,
  );
  expect(screen.getByText("Web Bluetooth unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /arm writes/i })).toBeDisabled();
});
