import { fireEvent, render, screen } from "@testing-library/react";
import { RawLog } from "./RawLog";

it("renders RX/TX directions, hex bytes, and notes", () => {
  render(
    <RawLog
      entries={[
        { at: 1, direction: "rx", bytes: Uint8Array.from([0xaa, 0x80]), note: "notification" },
        { at: 2, direction: "tx", bytes: Uint8Array.from([0xaa, 0xc4]), note: "write" },
        { at: 3, direction: "rx", bytes: Uint8Array.from([0xaa]), note: "checksum failure" },
      ]}
      onSendDebug={() => undefined}
    />,
  );
  expect(screen.getAllByText("RX").length).toBeGreaterThan(0);
  expect(screen.getByText("TX")).toBeInTheDocument();
  expect(screen.getByText("aa80")).toBeInTheDocument();
  expect(screen.getByText("checksum failure")).toBeInTheDocument();
  expect(screen.getByText("2 RX")).toBeInTheDocument();
  expect(screen.getByText("1 TX")).toBeInTheDocument();
  expect(screen.getByText("1 checksum")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export/i })).toBeEnabled();
});

it("can send the current debug capture while connected", () => {
  const onSendDebug = vi.fn();
  render(
    <RawLog
      entries={[{ at: 1, direction: "rx", bytes: Uint8Array.from([0xaa, 0x80]), note: "notification" }]}
      onSendDebug={onSendDebug}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /send debug/i }));

  expect(onSendDebug).toHaveBeenCalled();
});
