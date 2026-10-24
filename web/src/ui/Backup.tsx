import { useRef, useState } from "react";
import type { BackupState } from "@/session/controllerSession";

type BackupProps = {
  backup: BackupState;
  onExport: () => string;
  onExportHeb: () => Uint8Array;
  onImport: (json: string) => void;
  onRunBackup: () => void;
  onRunHebBackup: () => void;
  onSendServer: () => void;
};

export function Backup({ backup, onExport, onExportHeb, onImport, onRunBackup, onRunHebBackup, onSendServer }: BackupProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string>("");

  const exportBackup = () => {
    const blob = new Blob([onExport()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fardriver-register-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportHeb = () => {
    const bytes = onExportHeb();
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const blob = new Blob([body], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fardriver-controller-backup.heb";
    link.click();
    URL.revokeObjectURL(url);
  };

  const hebComplete = backup.heb.completedAt !== null;

  return (
    <section className="panel backup-panel" aria-labelledby="backup-heading">
      <div className="panel-heading">
        <h2 id="backup-heading">Backup</h2>
        <p>Export controller settings before writes, then restore from reviewed JSON.</p>
      </div>
      <div className={backup.required ? "backup-state required" : "backup-state ready"}>
        {backup.required ? "Backup required before writes" : `Backup completed: ${formatDate(backup.completedAt)}`}
      </div>
      <div className={hebComplete ? "backup-state ready" : "backup-state"}>
        HEB words: {backup.heb.mainWordsReceived}/156 main, {backup.heb.extendedWordsReceived}/192 extended
      </div>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={onRunHebBackup}>
          Run HEB dump
        </button>
        <button className="secondary-button" type="button" onClick={exportHeb} disabled={!hebComplete}>
          Export HEB
        </button>
        <button className="primary-button" type="button" onClick={onRunBackup}>
          Snapshot JSON
        </button>
        <button className="secondary-button" type="button" onClick={exportBackup} disabled={backup.required}>
          Export JSON
        </button>
        <button className="secondary-button" type="button" onClick={onSendServer}>
          Send to server
        </button>
        <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()}>
          Import JSON
        </button>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          const text = await file.text();
          setPreview(previewImport(text));
          onImport(text);
        }}
      />
      {preview ? <pre className="backup-preview">{preview}</pre> : null}
    </section>
  );
}

function formatDate(value: number | null): string {
  return value ? new Date(value).toLocaleString() : "unknown time";
}

function previewImport(json: string): string {
  try {
    const parsed = JSON.parse(json) as { values?: Record<string, unknown> };
    const keys = Object.keys(parsed.values ?? {});
    return keys.length ? `Import preview: ${keys.slice(0, 12).join(", ")}${keys.length > 12 ? " ..." : ""}` : "Import preview: no values";
  } catch {
    return "Import preview: malformed JSON";
  }
}
