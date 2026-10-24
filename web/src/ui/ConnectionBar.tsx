import { Bluetooth, Lock, Radio, ShieldAlert } from "lucide-react";
import type { ConnectionState } from "@/ble/connection";
import type { WriteMode } from "@/session/controllerSession";

type ConnectionBarProps = {
  state: ConnectionState;
  writeMode: WriteMode;
  backupRequired: boolean;
  unsupported: boolean;
  onConnectFarDriver: () => void;
  onExploreSegway: () => void;
  onDisconnect: () => void;
  onArmWrites: () => void;
};

export function ConnectionBar({
  state,
  writeMode,
  backupRequired,
  unsupported,
  onConnectFarDriver,
  onExploreSegway,
  onDisconnect,
  onArmWrites,
}: ConnectionBarProps) {
  return (
    <section className="connection-bar" aria-label="Connection controls">
      <div className="connection-status">
        {unsupported ? <ShieldAlert size={18} aria-hidden /> : <Radio size={18} aria-hidden />}
        <span>{unsupported ? "Web Bluetooth unavailable" : `Connection: ${state}`}</span>
      </div>
      <div className="connection-actions">
        <button className="primary-button" type="button" onClick={onConnectFarDriver} disabled={unsupported || state === "connected"}>
          <Bluetooth size={17} aria-hidden />
          Connect FarDriver
        </button>
        <button className="secondary-button" type="button" onClick={onExploreSegway} disabled={unsupported || state === "connected"}>
          <Bluetooth size={17} aria-hidden />
          Explore Segway
        </button>
        <button className="secondary-button" type="button" onClick={onDisconnect} disabled={state !== "connected"}>
          Disconnect
        </button>
        <button className="secondary-button" type="button" onClick={onArmWrites} disabled={backupRequired || writeMode === "armed"}>
          <Lock size={17} aria-hidden />
          {writeMode === "armed" ? "Writes armed" : "Arm writes"}
        </button>
      </div>
    </section>
  );
}
