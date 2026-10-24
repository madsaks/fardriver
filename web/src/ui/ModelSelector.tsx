import { Bike } from "lucide-react";
import type { VehicleProfile } from "@/model/modelProfiles";

type ModelSelectorProps = {
  profiles: VehicleProfile[];
  selectedProfile: VehicleProfile;
  onSelectProfile: (profileId: string) => void;
};

export function ModelSelector({ profiles, selectedProfile, onSelectProfile }: ModelSelectorProps) {
  return (
    <section className="model-selector" aria-label="Vehicle model">
      <div className="model-summary">
        <Bike size={18} aria-hidden />
        <div>
          <label htmlFor="model-profile">Model</label>
          <strong>{selectedProfile.label}</strong>
        </div>
      </div>
      <select id="model-profile" value={selectedProfile.id} onChange={(event) => onSelectProfile(event.target.value)}>
        {profiles.map((profile) => (
          <option value={profile.id} key={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
      {selectedProfile.battery.voltage > 0 ? (
        <span className="model-spec">
          {selectedProfile.battery.voltage} V · {selectedProfile.battery.packAh} Ah x {selectedProfile.battery.packCount} ·{" "}
          {selectedProfile.battery.totalAh} Ah total · {selectedProfile.battery.wh} Wh
        </span>
      ) : null}
    </section>
  );
}
