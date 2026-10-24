import type { BackupState } from "@/session/controllerSession";

const HEB_MAIN_WORDS = 156;
const HEB_EXTENDED_WORDS = 192;

export function hebCompletionCaptureKey(backup: BackupState): string | null {
  const heb = backup.heb;
  if (
    heb.requestedAt === null ||
    heb.completedAt === null ||
    heb.mainWordsReceived < HEB_MAIN_WORDS ||
    heb.extendedWordsReceived < HEB_EXTENDED_WORDS
  ) {
    return null;
  }
  return `${heb.requestedAt}:${heb.completedAt}:${heb.mainWordsReceived}:${heb.extendedWordsReceived}`;
}
