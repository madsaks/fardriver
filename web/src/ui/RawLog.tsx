import type { RawLogEntry } from "@/ble/connection";
import { bytesToHex } from "@/protocol/hex";

type RawLogProps = {
  entries: RawLogEntry[];
  onSendDebug?: () => void;
};

export function RawLog({ entries, onSendDebug }: RawLogProps) {
  const rxCount = entries.filter((entry) => entry.direction === "rx").length;
  const txCount = entries.filter((entry) => entry.direction === "tx").length;
  const checksumCount = entries.filter((entry) => entry.note.toLowerCase().includes("checksum")).length;

  const exportLog = () => {
    const body = entries
      .map((entry) => `${new Date(entry.at).toISOString()} ${entry.direction.toUpperCase()} ${bytesToHex(entry.bytes)} ${entry.note}`)
      .join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fardriver-raw-log.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel raw-log-panel" aria-labelledby="raw-log-heading">
      <div className="panel-heading row-heading">
        <div>
          <h2 id="raw-log-heading">Raw Log</h2>
          <p>RX/TX frames, dropped packets, and write attempts.</p>
        </div>
        <div className="button-row compact">
          <button className="secondary-button" type="button" onClick={exportLog} disabled={entries.length === 0}>
            Export
          </button>
          <button className="primary-button" type="button" onClick={onSendDebug} disabled={!onSendDebug || entries.length === 0}>
            Send debug
          </button>
        </div>
      </div>
      <div className="debug-stats" aria-label="Debug counters">
        <span>{rxCount} RX</span>
        <span>{txCount} TX</span>
        <span>{checksumCount} checksum</span>
      </div>
      <div className="log-table" role="table" aria-label="Raw frame log">
        <div className="log-row log-head" role="row">
          <span>Dir</span>
          <span>Hex</span>
          <span>Note</span>
        </div>
        {entries.length === 0 ? (
          <div className="log-empty">No frames yet.</div>
        ) : (
          entries.map((entry, index) => (
            <div className="log-row" role="row" key={`${entry.at}-${index}`}>
              <span className={`direction ${entry.direction}`}>{entry.direction.toUpperCase()}</span>
              <code>{bytesToHex(entry.bytes) || "--"}</code>
              <span>{entry.note}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
