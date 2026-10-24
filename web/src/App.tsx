import { useEffect, useMemo, useRef, useState } from "react";
import { MobileBottomTabs } from "@xenapseai/ui-kit";
import { Activity, Database, Gauge, List, SlidersHorizontal } from "lucide-react";
import { FarDriverBleConnection, type BluetoothLike } from "@/ble/connection";
import { hebCompletionCaptureKey } from "@/capture/hebCompletion";
import { sendCapture } from "@/capture/serverCapture";
import { vehicleProfiles } from "@/model/modelProfiles";
import { registerGroups } from "@/protocol/registers";
import { ControllerSession, type ControllerSnapshot } from "@/session/controllerSession";
import { Backup } from "@/ui/Backup";
import { ConnectionBar } from "@/ui/ConnectionBar";
import { Dashboard } from "@/ui/Dashboard";
import { ModelSelector } from "@/ui/ModelSelector";
import { QuickSetup } from "@/ui/QuickSetup";
import { RawLog } from "@/ui/RawLog";
import { Settings } from "@/ui/Settings";

type TabId = "setup" | "dashboard" | "settings" | "backup" | "raw";

const TABS: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "setup", label: "Setup", icon: Gauge },
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
  { id: "backup", label: "Backup", icon: Database },
  { id: "raw", label: "Raw Log", icon: List },
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const [captureStatus, setCaptureStatus] = useState<string>("");
  const [selectedProfileId, setSelectedProfileId] = useState("segway-e125s-stock-fardriver-72210");
  const lastInventoryCapture = useRef<string>("");
  const lastHebCompleteCapture = useRef<string>("");
  const session = useMemo(() => {
    const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;
    return new ControllerSession({
      connection: new FarDriverBleConnection({ bluetooth }),
    });
  }, []);
  const [snapshot, setSnapshot] = useState<ControllerSnapshot>(() => session.snapshot());

  useEffect(() => session.subscribe(setSnapshot), [session]);

  const groups = useMemo(() => registerGroups(), []);
  const selectedProfile = vehicleProfiles.find((profile) => profile.id === selectedProfileId) ?? vehicleProfiles[0];
  const unsupported = snapshot.connection === "unsupported" || !(navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;

  useEffect(() => {
    if (!snapshot.deviceInventory) {
      return;
    }
    const key = JSON.stringify(snapshot.deviceInventory);
    if (key === lastInventoryCapture.current) {
      return;
    }
    lastInventoryCapture.current = key;
    void sendCapture("device-inventory", session.exportCapture())
      .then((result) => setCaptureStatus(`Sent device inventory: ${result.filename}`))
      .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
  }, [session, snapshot.deviceInventory]);

  useEffect(() => {
    const key = hebCompletionCaptureKey(snapshot.backup);
    if (!key || key === lastHebCompleteCapture.current) {
      return;
    }
    lastHebCompleteCapture.current = key;
    void sendCapture("heb-backup-complete", session.exportCapture())
      .then((result) => setCaptureStatus(`Sent completed HEB backup: ${result.filename}`))
      .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
  }, [session, snapshot.backup]);

  const connectAndCapture = (profile: "fardriver" | "segway-explore") => {
    void session.connect(profile).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Bluetooth connection failed.";
      setCaptureStatus(`Connection failed: ${message}`);
      void sendCapture("connect-error", session.exportCapture()).catch(() => undefined);
    });
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">FarDriver BLE</p>
          <h1>Controller Console</h1>
        </div>
        <span className="status-pill">{snapshot.writeMode === "armed" ? "Writes armed" : "Read-only"}</span>
      </section>

      <ConnectionBar
        state={snapshot.connection}
        writeMode={snapshot.writeMode}
        backupRequired={snapshot.backup.required}
        unsupported={unsupported}
        onConnectFarDriver={() => {
          connectAndCapture("fardriver");
        }}
        onExploreSegway={() => {
          connectAndCapture("segway-explore");
        }}
        onDisconnect={() => session.disconnect()}
        onArmWrites={() => session.setWriteMode("armed")}
      />

      <ModelSelector
        profiles={vehicleProfiles}
        selectedProfile={selectedProfile}
        onSelectProfile={setSelectedProfileId}
      />

      {snapshot.errors.length ? (
        <section className="error-strip" aria-live="polite">
          {snapshot.errors.at(-1)}
        </section>
      ) : null}
      {captureStatus ? (
        <section className="capture-strip" aria-live="polite">
          {captureStatus}
        </section>
      ) : null}

      <section className="console-layout">
        <nav className="side-tabs" aria-label="Console sections">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                className={activeTab === tab.id ? "side-tab active" : "side-tab"}
                onClick={() => setActiveTab(tab.id)}
                key={tab.id}
              >
                <Icon size={18} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="console-main">
          {activeTab === "setup" ? (
            <QuickSetup
              profile={selectedProfile}
              values={snapshot.registerValues}
              connected={snapshot.connection === "connected"}
              writeMode={snapshot.writeMode}
              backupRequired={snapshot.backup.required}
              onRunHebBackup={() => {
                void session
                  .backupHeb()
                  .then(() => sendCapture("heb-backup-request", session.exportCapture()))
                  .then((result) => setCaptureStatus(`Sent HEB backup request: ${result.filename}`))
                  .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
              }}
              onArmWrites={() => session.setWriteMode("armed")}
              onWrite={(key, value) => {
                void session.writeRegister(key, value);
              }}
            />
          ) : null}
          {activeTab === "dashboard" ? <Dashboard telemetry={snapshot.telemetry} /> : null}
          {activeTab === "settings" ? (
            <Settings
              groups={groups}
              values={snapshot.registerValues}
              writeMode={snapshot.writeMode}
              modelProfile={selectedProfile}
              onWrite={(key, value) => {
                void session.writeRegister(key, value);
              }}
            />
          ) : null}
          {activeTab === "backup" ? (
            <Backup
              backup={snapshot.backup}
              onExport={() => session.exportBackup()}
              onExportHeb={() => session.exportHebBackup()}
              onImport={(json) => session.importBackup(json)}
              onRunBackup={() => {
                void session
                  .backupRegisters()
                  .then(() => sendCapture("backup", session.exportCapture()))
                  .then((result) => setCaptureStatus(`Sent backup: ${result.filename}`))
                  .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
              }}
              onRunHebBackup={() => {
                void session
                  .backupHeb()
                  .then(() => sendCapture("heb-backup-request", session.exportCapture()))
                  .then((result) => setCaptureStatus(`Sent HEB backup request: ${result.filename}`))
                  .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
              }}
              onSendServer={() => {
                void sendCapture("manual", session.exportCapture())
                  .then((result) => setCaptureStatus(`Sent capture: ${result.filename}`))
                  .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
              }}
            />
          ) : null}
          {activeTab === "raw" ? (
            <RawLog
              entries={snapshot.log}
              onSendDebug={() => {
                void sendCapture("raw-debug", session.exportCapture())
                  .then((result) => setCaptureStatus(`Sent raw debug: ${result.filename}`))
                  .catch((error: unknown) => setCaptureStatus(error instanceof Error ? error.message : "Capture failed"));
              }}
            />
          ) : null}
        </div>
      </section>
      <div className="mobile-bottom-tabs">
        <MobileBottomTabs
          tabs={TABS.map((tab) => ({ label: tab.label }))}
          activeTab={TABS.find((tab) => tab.id === activeTab)?.label ?? TABS[0].label}
          onTabChange={(label) => {
            const tab = TABS.find((entry) => entry.label === label);
            if (tab) {
              setActiveTab(tab.id);
            }
          }}
        />
      </div>
    </main>
  );
}
