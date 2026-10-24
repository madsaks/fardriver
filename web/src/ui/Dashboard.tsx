type DashboardProps = {
  telemetry: Record<string, number>;
};

const METRICS = [
  { key: "vehicle_speed", label: "Speed", unit: "km/h" },
  { key: "motor_rpm", label: "Motor RPM", unit: "rpm" },
  { key: "bus_voltage", label: "Bus voltage", unit: "V" },
  { key: "line_current", label: "Line current", unit: "A" },
  { key: "controller_temperature", label: "Controller temp", unit: "C" },
  { key: "motor_temperature", label: "Motor temp", unit: "C" },
];

export function Dashboard({ telemetry }: DashboardProps) {
  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-heading">
      <div className="panel-heading">
        <h2 id="dashboard-heading">Dashboard</h2>
        <p>Live decoded telemetry from valid controller frames.</p>
      </div>
      <div className="metric-grid">
        {METRICS.map((metric) => (
          <div className="metric" key={metric.key}>
            <span className="metric-label">{metric.label}</span>
            <strong>{formatMetric(telemetry[metric.key])}</strong>
            <span className="metric-unit">{metric.unit}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMetric(value: number | undefined): string {
  if (value === undefined) {
    return "--";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
