import { useEffect, useMemo, useState } from "react";
import { BatteryCharging, Gauge, ShieldCheck, Zap } from "lucide-react";
import type { VehicleProfile } from "@/model/modelProfiles";
import type { WriteMode } from "@/session/controllerSession";

type QuickSetupProps = {
  profile: VehicleProfile;
  values: Record<string, number>;
  connected: boolean;
  writeMode: WriteMode;
  backupRequired: boolean;
  onRunHebBackup: () => void;
  onArmWrites: () => void;
  onWrite: (key: string, value: number) => void;
};

type TunePreset = "range" | "daily" | "sport";

const PRESETS: Record<TunePreset, { label: string; lineCurrentA: number; acceleration: number }> = {
  range: { label: "Range", lineCurrentA: 55, acceleration: 120 },
  daily: { label: "Daily", lineCurrentA: 60, acceleration: 170 },
  sport: { label: "Sport", lineCurrentA: 70, acceleration: 224 },
};

export function QuickSetup({
  profile,
  values,
  connected,
  writeMode,
  backupRequired,
  onRunHebBackup,
  onArmWrites,
  onWrite,
}: QuickSetupProps) {
  const hasPowerEnvelope = profile.power.uiMaxLineCurrentA > 0;
  const defaultLineCurrent = values.max_line_current ?? profile.power.baselineLineCurrentA;
  const defaultAcceleration = values.max_acceleration ?? 170;
  const [lineCurrentA, setLineCurrentA] = useState(defaultLineCurrent || 60);
  const [acceleration, setAcceleration] = useState(defaultAcceleration);
  const [targetSpeedKmh, setTargetSpeedKmh] = useState(45);

  useEffect(() => {
    setLineCurrentA(values.max_line_current ?? profile.power.baselineLineCurrentA || 60);
    setAcceleration(values.max_acceleration ?? 170);
  }, [profile.id, profile.power.baselineLineCurrentA, values.max_acceleration, values.max_line_current]);

  const nominalPowerKw = useMemo(
    () => (profile.battery.voltage > 0 ? (profile.battery.voltage * lineCurrentA) / 1000 : 0),
    [lineCurrentA, profile.battery.voltage],
  );
  const writesReady = connected && !backupRequired && writeMode === "armed";
  const recommendedMax = profile.power.recommendedMaxLineCurrentA;
  const isAboveRecommended = recommendedMax > 0 && lineCurrentA > recommendedMax;

  const choosePreset = (preset: TunePreset) => {
    const target = PRESETS[preset];
    const maxCurrent = profile.power.uiMaxLineCurrentA || target.lineCurrentA;
    setLineCurrentA(Math.min(target.lineCurrentA, maxCurrent));
    setAcceleration(target.acceleration);
  };

  return (
    <section className="panel quick-setup-panel" aria-labelledby="quick-setup-heading">
      <div className="panel-heading quick-setup-heading">
        <div>
          <p className="eyebrow">E125S guided tuning</p>
          <h2 id="quick-setup-heading">Quick setup</h2>
          <p>Back up first, then tune the two controls that materially change how the scooter feels.</p>
        </div>
        <div className="setup-profile-chip">
          <Gauge size={18} aria-hidden />
          <span>{profile.label}</span>
        </div>
      </div>

      <div className="setup-status-grid">
        <div className={backupRequired ? "setup-status warning" : "setup-status ready"}>
          <ShieldCheck size={20} aria-hidden />
          <div>
            <strong>HEB backup</strong>
            <span>{backupRequired ? "Required before writes" : "Complete"}</span>
          </div>
          {backupRequired ? (
            <button className="secondary-button" type="button" onClick={onRunHebBackup} disabled={!connected}>
              Run backup
            </button>
          ) : null}
        </div>
        <div className={writeMode === "armed" ? "setup-status ready" : "setup-status"}>
          <Zap size={20} aria-hidden />
          <div>
            <strong>Write mode</strong>
            <span>{writeMode === "armed" ? "Armed" : "Read-only"}</span>
          </div>
          {writeMode !== "armed" ? (
            <button className="secondary-button" type="button" onClick={onArmWrites} disabled={backupRequired}>
              Arm writes
            </button>
          ) : null}
        </div>
      </div>

      <div className="tune-preset-row" aria-label="Tune presets">
        {(Object.keys(PRESETS) as TunePreset[]).map((key) => (
          <button className="tune-preset" type="button" key={key} onClick={() => choosePreset(key)}>
            <strong>{PRESETS[key].label}</strong>
            <span>{PRESETS[key].lineCurrentA} A · accel {PRESETS[key].acceleration}</span>
          </button>
        ))}
      </div>

      <div className="quick-control-grid">
        <article className="quick-control-card">
          <div className="quick-control-title">
            <BatteryCharging size={21} aria-hidden />
            <div>
              <h3>Power</h3>
              <p>FarDriver maximum line current</p>
            </div>
            <strong>{lineCurrentA} A</strong>
          </div>
          <input
            aria-label="Maximum line current"
            type="range"
            min={40}
            max={hasPowerEnvelope ? profile.power.uiMaxLineCurrentA : 80}
            step={1}
            value={lineCurrentA}
            onChange={(event) => setLineCurrentA(Number(event.target.value))}
          />
          <div className="range-labels">
            <span>40 A</span>
            <span className="recommended-mark">Recommended max {recommendedMax || "--"} A</span>
            <span>{hasPowerEnvelope ? profile.power.uiMaxLineCurrentA : 80} A</span>
          </div>
          <div className={isAboveRecommended ? "power-readout warning" : "power-readout"}>
            <strong>{nominalPowerKw.toFixed(2)} kW</strong>
            <span>nominal battery input at {profile.battery.voltage || "--"} V</span>
          </div>
          {isAboveRecommended ? (
            <p className="inline-warning">
              Above the recommended stock-profile ceiling. The 80 A end of the slider is a short-duration sport ceiling,
              not a validated continuous rating.
            </p>
          ) : (
            <p className="quick-help">{profile.power.note}</p>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={!writesReady}
            onClick={() => onWrite("max_line_current", lineCurrentA)}
          >
            Write power limit
          </button>
        </article>

        <article className="quick-control-card">
          <div className="quick-control-title">
            <Zap size={21} aria-hidden />
            <div>
              <h3>Acceleration</h3>
              <p>FarDriver maximum acceleration ramp</p>
            </div>
            <strong>{acceleration}</strong>
          </div>
          <input
            aria-label="Maximum acceleration"
            type="range"
            min={2}
            max={224}
            step={1}
            value={acceleration}
            onChange={(event) => setAcceleration(Number(event.target.value))}
          />
          <div className="range-labels">
            <span>Soft</span>
            <span>Daily</span>
            <span>Max</span>
          </div>
          <p className="quick-help">
            This changes how quickly torque ramps in. It does not raise the battery-current ceiling by itself.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={!writesReady}
            onClick={() => onWrite("max_acceleration", acceleration)}
          >
            Write acceleration
          </button>
        </article>

        <article className="quick-control-card speed-preview-card">
          <div className="quick-control-title">
            <Gauge size={21} aria-hidden />
            <div>
              <h3>Road-speed target</h3>
              <p>Calibration preview</p>
            </div>
            <strong>{targetSpeedKmh} km/h</strong>
          </div>
          <input
            aria-label="Road speed target"
            type="range"
            min={25}
            max={60}
            step={1}
            value={targetSpeedKmh}
            onChange={(event) => setTargetSpeedKmh(Number(event.target.value))}
          />
          <div className="range-labels">
            <span>25</span>
            <span>45 stock</span>
            <span>60</span>
          </div>
          <p className="quick-help">
            Preview only for now. FarDriver stores the actual ceiling in motor RPM, so automatic km/h writes stay disabled
            until the E125S pole-pair and speed-display calibration are hardware-validated.
          </p>
          <button className="secondary-button" type="button" disabled>
            Calibration required
          </button>
        </article>
      </div>
    </section>
  );
}
