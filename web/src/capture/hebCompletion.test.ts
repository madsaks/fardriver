import { hebCompletionCaptureKey } from "./hebCompletion";
import type { BackupState } from "@/session/controllerSession";

const COMPLETE_MAIN_WORDS = 156;
const COMPLETE_EXTENDED_WORDS = 192;

it("does not create an HEB completion key before the dump completes", () => {
  expect(
    hebCompletionCaptureKey(
      backup({
        requestedAt: 1000,
        completedAt: null,
        mainWordsReceived: COMPLETE_MAIN_WORDS,
        extendedWordsReceived: COMPLETE_EXTENDED_WORDS,
      }),
    ),
  ).toBeNull();
});

it("does not create an HEB completion key for incomplete word counts", () => {
  expect(
    hebCompletionCaptureKey(
      backup({
        requestedAt: 1000,
        completedAt: 2000,
        mainWordsReceived: COMPLETE_MAIN_WORDS,
        extendedWordsReceived: COMPLETE_EXTENDED_WORDS - 1,
      }),
    ),
  ).toBeNull();
});

it("creates a stable HEB completion key when the full dump is available", () => {
  expect(
    hebCompletionCaptureKey(
      backup({
        requestedAt: 1000,
        completedAt: 2000,
        mainWordsReceived: COMPLETE_MAIN_WORDS,
        extendedWordsReceived: COMPLETE_EXTENDED_WORDS,
      }),
    ),
  ).toBe("1000:2000:156:192");
});

function backup(heb: Partial<BackupState["heb"]>): BackupState {
  return {
    required: false,
    completedAt: heb.completedAt ?? null,
    values: {},
    heb: {
      requestedAt: null,
      completedAt: null,
      mainWordsReceived: 0,
      extendedWordsReceived: 0,
      dump: {
        mainWords: [],
        extendedWords: [],
      },
      ...heb,
    },
  };
}
