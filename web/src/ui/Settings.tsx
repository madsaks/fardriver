import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { expectedValueForRegister, type VehicleProfile } from "@/model/modelProfiles";
import type { RegisterMeta } from "@/protocol/registers";
import { validateRegisterValue } from "@/protocol/registers";
import type { WriteMode } from "@/session/controllerSession";

type SettingsProps = {
  groups: Array<{ group: string; registers: RegisterMeta[] }>;
  values: Record<string, number>;
  writeMode: WriteMode;
  modelProfile?: VehicleProfile;
  onWrite: (key: string, displayValue: number) => void;
};

export function Settings({ groups, values, writeMode, modelProfile, onWrite }: SettingsProps) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.group ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openTechnical, setOpenTechnical] = useState<Record<string, boolean>>({});
  const active = useMemo(
    () => groups.find((group) => group.group === activeGroup) ?? groups[0],
    [activeGroup, groups],
  );

  return (
    <section className="panel settings-panel" aria-labelledby="settings-heading">
      <div className="panel-heading">
        <h2 id="settings-heading">Settings</h2>
        <p>Explained register metadata from the Phase 1 protocol table.</p>
      </div>
      <div className="group-tabs" role="tablist" aria-label="Register groups">
        {groups.map((group) => (
          <button
            className={group.group === active?.group ? "tab active" : "tab"}
            key={group.group}
            type="button"
            onClick={() => setActiveGroup(group.group)}
          >
            {group.group}
          </button>
        ))}
      </div>
      <div className="settings-table">
        {active?.registers.map((register) => {
          const current = values[register.key];
          const draft = drafts[register.key] ?? (current === undefined ? "" : String(current));
          const numericDraft = Number(draft);
          const error = draft === "" ? null : validateRegisterValue(register, numericDraft);
          const editable = writeMode === "armed" && register.access === "rw" && register.type !== "bitfield";
          const expected = modelProfile ? expectedValueForRegister(modelProfile, register.key) : null;
          const differsFromModel = expected !== null && current !== undefined && Math.abs(current - expected) > 0.0001;
          return (
            <article className="setting-row" key={register.key}>
              <div className="setting-copy">
                <div className="setting-title-line">
                  <h3>{register.name}</h3>
                  {register.confidence !== "high" ? <span className="confidence">Needs bike validation</span> : null}
                </div>
                <p>{friendlySettingDescription(register)}</p>
                <div className="setting-actions-line">
                  <button
                    className="info-button"
                    type="button"
                    aria-label={`Technical details for ${register.name}`}
                    aria-pressed={Boolean(openTechnical[register.key])}
                    onClick={() => setOpenTechnical({ ...openTechnical, [register.key]: !openTechnical[register.key] })}
                  >
                    <Info size={16} aria-hidden />
                    <span>Info</span>
                  </button>
                </div>
                {openTechnical[register.key] ? <p className="technical-copy">{register.explain}</p> : null}
                <span className="setting-meta">
                  0x{register.addr.toString(16).toUpperCase().padStart(2, "0")} · {register.key}
                </span>
              </div>
              <div className="setting-control">
                {register.enum ? (
                  <select
                    value={draft}
                    disabled={!editable}
                    onChange={(event) => setDrafts({ ...drafts, [register.key]: event.target.value })}
                  >
                    <option value="">Unknown</option>
                    {Object.entries(register.enum).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={draft}
                    min={register.min}
                    max={register.max}
                    step={register.scale}
                    disabled={!editable}
                    onChange={(event) => setDrafts({ ...drafts, [register.key]: event.target.value })}
                    aria-label={`${register.name} value`}
                  />
                )}
                <span className="unit">{register.unit || "raw"}</span>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!editable || draft === "" || Boolean(error)}
                  onClick={() => {
                    const oldValue = current === undefined ? "unknown" : `${current} ${register.unit}`;
                    const nextValue = `${numericDraft} ${register.unit}`;
                    if (
                      window.confirm(
                        `Write ${register.name}?\n\nOld: ${oldValue}\nNew: ${nextValue}\n\n${register.explain}`,
                      )
                    ) {
                      onWrite(register.key, numericDraft);
                    }
                  }}
                >
                  Write
                </button>
                <span className="setting-limit">{formatLimit(register)}</span>
                {expected !== null ? (
                  <span className={differsFromModel ? "model-expected warning" : "model-expected"}>
                    Expected for model: {formatDisplayValue(register, expected)}
                  </span>
                ) : null}
                {differsFromModel ? <span className="model-mismatch">Current differs from selected model</span> : null}
                {error ? <span className="field-error">{error}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatLimit(register: RegisterMeta): string {
  const unit = register.unit ? ` ${register.unit}` : "";
  return `Original app limit: ${register.min}${unit} to ${register.max}${unit}`;
}

function formatDisplayValue(register: RegisterMeta, value: number): string {
  return `${value}${register.unit ? ` ${register.unit}` : ""}`;
}

function friendlySettingDescription(register: RegisterMeta): string {
  const subject = register.name
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const unit = register.unit ? ` Values are shown in ${register.unit}.` : " Values are shown as the controller's stored raw number.";
  const writable = register.access === "rw"
    ? "Review the current value before making changes."
    : "This is read-only in the current map.";
  return `Current controller setting for ${subject}.${unit} ${writable}`;
}
