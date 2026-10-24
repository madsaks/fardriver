import { render, screen } from "@testing-library/react";
import type { BackupState } from "@/session/controllerSession";
import { Backup } from "./Backup";

function backupState(overrides: Partial<BackupState> = {}): BackupState {
  return {
    required: true,
    completedAt: null,
    values: {},
    heb: {
      requestedAt: null,
      completedAt: null,
      mainWordsReceived: 0,
      extendedWordsReceived: 0,
      dump: {
        mainWords: Array(156).fill(null),
        extendedWords: Array(192).fill(null),
      },
    },
    ...overrides,
  };
}

it("shows backup requirement before writes", () => {
  render(
    <Backup
      backup={backupState()}
      onExport={() => "{}"}
      onExportHeb={() => new Uint8Array()}
      onImport={() => undefined}
      onRunBackup={() => undefined}
      onRunHebBackup={() => undefined}
      onSendServer={() => undefined}
    />,
  );
  expect(screen.getByText(/Backup required before writes/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export json/i })).toBeDisabled();
});

it("shows ready backup state", () => {
  render(
    <Backup
      backup={backupState({ required: false, completedAt: 1000, values: { rated_voltage: 48 } })}
      onExport={() => "{}"}
      onExportHeb={() => new Uint8Array()}
      onImport={() => undefined}
      onRunBackup={() => undefined}
      onRunHebBackup={() => undefined}
      onSendServer={() => undefined}
    />,
  );
  expect(screen.getByText(/Backup completed/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export json/i })).toBeEnabled();
});

it("enables HEB export only after a full controller dump", () => {
  const completeDump = {
    mainWords: Array(156).fill(1),
    extendedWords: Array(192).fill(1),
  };
  const { rerender } = render(
    <Backup
      backup={backupState()}
      onExport={() => "{}"}
      onExportHeb={() => new Uint8Array(696)}
      onImport={() => undefined}
      onRunBackup={() => undefined}
      onRunHebBackup={() => undefined}
      onSendServer={() => undefined}
    />,
  );
  expect(screen.getByRole("button", { name: /export heb/i })).toBeDisabled();

  rerender(
    <Backup
      backup={backupState({
        required: false,
        completedAt: 1000,
        heb: {
          requestedAt: 500,
          completedAt: 1000,
          mainWordsReceived: 156,
          extendedWordsReceived: 192,
          dump: completeDump,
        },
      })}
      onExport={() => "{}"}
      onExportHeb={() => new Uint8Array(696)}
      onImport={() => undefined}
      onRunBackup={() => undefined}
      onRunHebBackup={() => undefined}
      onSendServer={() => undefined}
    />,
  );

  expect(screen.getByText(/HEB words: 156\/156 main, 192\/192 extended/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export heb/i })).toBeEnabled();
});
