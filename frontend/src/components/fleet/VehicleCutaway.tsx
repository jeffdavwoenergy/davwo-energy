"use client";

import type {
  VehicleKind, VehicleComponent, VehicleFault, VehicleDiagnostics, FaultSeverity,
} from "@/lib/deviceMonitoringTypes";

/**
 * Top-down "x-ray" cutaway of a fleet vehicle (front faces right, so the
 * vehicle's left side is the top edge). Each component that can carry a fault
 * has a hotspot: faults pulse in their severity colour, everything else is a
 * quiet dot you can still click to see its reading.
 */

interface Layout {
  x0: number; x1: number; y0: number; y1: number;
  front: number; rear: number; extraAxles: number[];
  nose: number; tail: number;
  wheelW: number;
  battery: [number, number];
  /** Truck only: x where the cab starts. */
  cabX?: number;
}

const LAYOUTS: Record<VehicleKind, Layout> = {
  car: { x0: 150, x1: 850, y0: 110, y1: 310, front: 690, rear: 300, extraAxles: [], nose: 80, tail: 60, wheelW: 82, battery: [350, 560] },
  van: { x0: 110, x1: 890, y0: 95, y1: 325, front: 770, rear: 285, extraAxles: [], nose: 46, tail: 14, wheelW: 86, battery: [335, 640] },
  bus: { x0: 50, x1: 950, y0: 112, y1: 308, front: 820, rear: 270, extraAxles: [], nose: 26, tail: 20, wheelW: 92, battery: [330, 690] },
  truck: { x0: 40, x1: 950, y0: 100, y1: 320, front: 870, rear: 560, extraAxles: [460], nose: 30, tail: 6, wheelW: 92, battery: [600, 800], cabX: 780 },
};

export const COMPONENT_LABEL: Record<VehicleComponent, string> = {
  battery: "High-voltage battery",
  motor: "Drive motor",
  charge_port: "Charge port",
  onboard_charger: "Onboard charger",
  tyre_fl: "Front left tyre",
  tyre_fr: "Front right tyre",
  tyre_rl: "Rear left tyre",
  tyre_rr: "Rear right tyre",
  brakes: "Brakes",
  aux_battery: "12V battery",
  cooling: "Cooling system",
  hvac: "Cabin heat pump",
  telematics: "Telematics unit",
};

export const SEVERITY_COLOR: Record<FaultSeverity, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#38bdf8",
};
const SEVERITY_RANK: Record<FaultSeverity, number> = { critical: 0, warning: 1, info: 2 };

function hotspots(L: Layout): Record<VehicleComponent, { x: number; y: number }> {
  const mid = (L.y0 + L.y1) / 2;
  return {
    battery: { x: (L.battery[0] + L.battery[1]) / 2, y: mid },
    motor: { x: L.rear, y: mid },
    onboard_charger: { x: L.rear - 72, y: mid + 48 },
    charge_port: { x: L.rear - 72, y: L.y0 + 2 },
    tyre_fl: { x: L.front, y: L.y0 - 4 },
    tyre_fr: { x: L.front, y: L.y1 + 4 },
    tyre_rl: { x: L.rear, y: L.y0 - 4 },
    tyre_rr: { x: L.rear, y: L.y1 + 4 },
    brakes: { x: L.front, y: mid },
    aux_battery: { x: L.x1 - 78, y: mid + 50 },
    cooling: { x: L.x1 - 34, y: mid },
    hvac: { x: L.front - 100, y: mid - 50 },
    telematics: { x: L.front - 100, y: mid + 50 },
  };
}

function bodyPath(x0: number, x1: number, y0: number, y1: number, nose: number, tail: number) {
  return `M ${x0 + tail} ${y0} H ${x1 - nose} Q ${x1} ${y0} ${x1} ${y0 + nose} V ${y1 - nose} Q ${x1} ${y1} ${x1 - nose} ${y1} H ${x0 + tail} Q ${x0} ${y1} ${x0} ${y1 - tail} V ${y0 + tail} Q ${x0} ${y0} ${x0 + tail} ${y0} Z`;
}

const LINE = "rgba(148, 210, 255, 0.55)";
const FAINT = "rgba(148, 210, 255, 0.22)";
const TEXT = "rgba(226, 240, 255, 0.85)";

function Seats({ L, kind }: { L: Layout; kind: VehicleKind }) {
  const mid = (L.y0 + L.y1) / 2;
  const seat = (x: number, y: number, k: string) => (
    <rect key={k} x={x - 17} y={y - 17} width={34} height={34} rx={9} fill="none" stroke={FAINT} strokeWidth={2} />
  );
  if (kind === "car") {
    return <g>{[L.front - 175, L.rear + 140].flatMap((x, i) => [seat(x, mid - 42, `a${i}`), seat(x, mid + 42, `b${i}`)])}</g>;
  }
  if (kind === "bus") {
    const xs = Array.from({ length: 13 }, (_, i) => L.x0 + 90 + i * 52).filter((x) => x < L.front - 70);
    return (
      <g>
        {xs.flatMap((x, i) => [seat(x, L.y0 + 30, `l${i}`), seat(x, L.y1 - 30, `r${i}`)])}
        {seat(L.front - 15, L.y0 + 40, "drv")}
      </g>
    );
  }
  // van / truck: seats in the cab, a dashed load area behind.
  const cabFront = L.x1 - 120;
  const loadEnd = L.cabX ? L.cabX - 12 : L.front - 175;
  return (
    <g>
      {[mid - 62, mid, mid + 62].map((y, i) => seat(cabFront - 40, y, `c${i}`))}
      <rect x={L.x0 + 18} y={L.y0 + 16} width={loadEnd - L.x0 - 18} height={L.y1 - L.y0 - 32} rx={8}
        fill="none" stroke={FAINT} strokeWidth={2} strokeDasharray="8 8" />
      <text x={L.x0 + 34} y={L.y1 - 30} fontSize={15} fill={FAINT} fontWeight={600} letterSpacing={3}>
        {kind === "truck" ? "BODY" : "CARGO"}
      </text>
    </g>
  );
}

export interface VehicleCutawayProps {
  kind: VehicleKind;
  faults: VehicleFault[];
  diagnostics: VehicleDiagnostics;
  socPct: number;
  pluggedIn: boolean;
  charging: boolean;
  selected: VehicleComponent | null;
  onSelect: (c: VehicleComponent) => void;
}

export default function VehicleCutaway({
  kind, faults, diagnostics, socPct, pluggedIn, charging, selected, onSelect,
}: VehicleCutawayProps) {
  const L = LAYOUTS[kind];
  const spots = hotspots(L);
  const mid = (L.y0 + L.y1) / 2;
  const axles = [L.front, L.rear, ...L.extraAxles];
  const worst = new Map<VehicleComponent, FaultSeverity>();
  faults.forEach((f) => {
    const cur = worst.get(f.component);
    if (!cur || SEVERITY_RANK[f.severity] < SEVERITY_RANK[cur]) worst.set(f.component, f.severity);
  });
  const faultNo = new Map<VehicleComponent, number>();
  [...faults]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .forEach((f) => { if (!faultNo.has(f.component)) faultNo.set(f.component, faultNo.size + 1); });

  // Battery cells: a grid, lit left-to-right by state of charge.
  const [bx0, bx1] = L.battery;
  const by0 = L.y0 + 34;
  const by1 = L.y1 - 34;
  const cols = Math.max(6, Math.round((bx1 - bx0) / 26));
  const rows = 4;
  const cw = (bx1 - bx0 - 16) / cols;
  const ch = (by1 - by0 - 16) / rows;
  const lit = Math.round((socPct / 100) * cols);
  const batteryFault = worst.get("battery") ?? worst.get("cooling");

  const tyreKey: Record<"tyre_fl" | "tyre_fr" | "tyre_rl" | "tyre_rr", keyof VehicleDiagnostics["tyrePsi"]> = {
    tyre_fl: "fl", tyre_fr: "fr", tyre_rl: "rl", tyre_rr: "rr",
  };

  return (
    <svg viewBox="0 0 1000 420" className="w-full h-auto select-none" role="img"
      aria-label={`Cutaway of a ${kind} showing ${faults.length} fault${faults.length === 1 ? "" : "s"}`}>
      <defs>
        <pattern id="cutaway-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148,210,255,0.06)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={1000} height={420} fill="url(#cutaway-grid)" />

      {/* Wheels (under the body), on every axle */}
      {axles.flatMap((ax, i) =>
        [L.y0, L.y1].map((y, j) => (
          <rect key={`w${i}${j}`} x={ax - L.wheelW / 2} y={y - 17} width={L.wheelW} height={34} rx={10}
            fill="rgba(15, 23, 42, 0.9)" stroke={LINE} strokeWidth={2} />
        )),
      )}

      {/* Body */}
      {L.cabX ? (
        <>
          <path d={bodyPath(L.x0, L.cabX - 14, L.y0, L.y1, 8, L.tail)} fill="rgba(56, 189, 248, 0.05)" stroke={LINE} strokeWidth={2.5} />
          <path d={bodyPath(L.cabX, L.x1, L.y0 + 6, L.y1 - 6, L.nose, 10)} fill="rgba(56, 189, 248, 0.07)" stroke={LINE} strokeWidth={2.5} />
        </>
      ) : (
        <path d={bodyPath(L.x0, L.x1, L.y0, L.y1, L.nose, L.tail)} fill="rgba(56, 189, 248, 0.05)" stroke={LINE} strokeWidth={2.5} />
      )}

      {/* Windscreen */}
      <path
        d={kind === "car"
          ? `M ${L.front - 70} ${L.y0 + 22} Q ${L.front - 20} ${mid} ${L.front - 70} ${L.y1 - 22}`
          : `M ${L.x1 - 40} ${L.y0 + 24} Q ${L.x1 - 18} ${mid} ${L.x1 - 40} ${L.y1 - 24}`}
        fill="none" stroke={LINE} strokeWidth={3} strokeLinecap="round" />

      <Seats L={L} kind={kind} />

      {/* Axles + drive motor on the rear axle */}
      {axles.map((ax, i) => (
        <line key={`ax${i}`} x1={ax} y1={L.y0 + 4} x2={ax} y2={L.y1 - 4} stroke={FAINT} strokeWidth={4} />
      ))}
      <rect x={L.rear - 32} y={mid - 30} width={64} height={60} rx={10}
        fill={worst.get("motor") ? `${SEVERITY_COLOR[worst.get("motor")!]}33` : "rgba(15, 23, 42, 0.85)"} stroke={LINE} strokeWidth={2} />
      <text x={L.rear} y={mid + 50} textAnchor="middle" fontSize={13} fill={TEXT}>{diagnostics.motorTempC}°C</text>

      {/* High-voltage battery pack */}
      <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} rx={12}
        fill="rgba(15, 23, 42, 0.75)" stroke={batteryFault ? SEVERITY_COLOR[batteryFault] : LINE} strokeWidth={2.5} />
      {Array.from({ length: rows }).flatMap((_, rI) =>
        Array.from({ length: cols }).map((__, cI) => (
          <rect key={`c${rI}-${cI}`} x={bx0 + 8 + cI * cw + 2} y={by0 + 8 + rI * ch + 2} width={cw - 4} height={ch - 4} rx={3}
            fill={cI < lit ? (socPct < 20 ? "rgba(239,68,68,0.55)" : socPct < 50 ? "rgba(245,158,11,0.5)" : "rgba(16,185,129,0.5)") : "rgba(148,210,255,0.08)"} />
        )),
      )}
      <rect x={(bx0 + bx1) / 2 - 58} y={mid - 30} width={116} height={60} rx={10} fill="rgba(2, 6, 23, 0.82)" />
      <text x={(bx0 + bx1) / 2} y={mid - 2} textAnchor="middle" fontSize={24} fontWeight={700} fill="#fff">{socPct}%</text>
      <text x={(bx0 + bx1) / 2} y={mid + 19} textAnchor="middle" fontSize={13} fill={TEXT}>{diagnostics.batteryTempC}°C pack</text>

      {/* Charging cable from the charge port */}
      {pluggedIn && (
        <g>
          <path d={`M ${spots.charge_port.x} ${L.y0 - 6} C ${spots.charge_port.x - 10} ${L.y0 - 60}, ${spots.charge_port.x - 90} ${L.y0 - 50}, ${spots.charge_port.x - 120} ${L.y0 - 92}`}
            fill="none" stroke={charging ? "#34d399" : "rgba(148,210,255,0.6)"} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={charging ? "10 8" : undefined}>
            {charging && <animate attributeName="stroke-dashoffset" from="36" to="0" dur="0.9s" repeatCount="indefinite" />}
          </path>
          <text x={spots.charge_port.x - 132} y={L.y0 - 74} textAnchor="end" fontSize={13} fill={charging ? "#6ee7b7" : TEXT}>
            {charging ? "Charging" : "Plugged in"}
          </text>
        </g>
      )}

      {/* Tyre pressures beside each tyre */}
      {(Object.keys(tyreKey) as (keyof typeof tyreKey)[]).map((c) => {
        const psi = diagnostics.tyrePsi[tyreKey[c]];
        const low = psi < diagnostics.tyreTargetPsi - 4;
        const top = c === "tyre_fl" || c === "tyre_rl";
        return (
          <text key={c} x={spots[c].x + L.wheelW / 2 + 8} y={top ? L.y0 - 22 : L.y1 + 32} fontSize={13}
            fill={low ? "#fca5a5" : TEXT} fontWeight={low ? 700 : 400}>
            {psi} psi
          </text>
        );
      })}
      <text x={spots.aux_battery.x} y={spots.aux_battery.y + 30} textAnchor="middle" fontSize={12}
        fill={diagnostics.auxBatteryV < 12 ? "#fca5a5" : TEXT}>{diagnostics.auxBatteryV} V</text>

      {/* Hotspots */}
      {(Object.keys(spots) as VehicleComponent[]).map((c) => {
        const { x, y } = spots[c];
        const sev = worst.get(c);
        const isSel = selected === c;
        return (
          <g key={c} onClick={() => onSelect(c)} style={{ cursor: "pointer" }} role="button" aria-label={COMPONENT_LABEL[c]}>
            <title>{COMPONENT_LABEL[c]}{sev ? ` — ${faults.filter((f) => f.component === c).map((f) => f.title).join(", ")}` : ""}</title>
            <circle cx={x} cy={y} r={22} fill="transparent" />
            {sev ? (
              <>
                <circle cx={x} cy={y} r={13} fill="none" stroke={SEVERITY_COLOR[sev]} strokeWidth={3}>
                  <animate attributeName="r" values="13;26;13" dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0;0.9" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r={13} fill={SEVERITY_COLOR[sev]} stroke={isSel ? "#fff" : "rgba(2,6,23,0.6)"} strokeWidth={isSel ? 3 : 2} />
                <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff">{faultNo.get(c)}</text>
              </>
            ) : (
              <circle cx={x} cy={y} r={isSel ? 8 : 5} fill={isSel ? "#fff" : "rgba(226,240,255,0.45)"} stroke={isSel ? "#38bdf8" : "none"} strokeWidth={3} />
            )}
          </g>
        );
      })}

      {/* Orientation hint */}
      <text x={L.x1 + 6} y={mid - 8} fontSize={12} fill={FAINT} transform={`rotate(90 ${L.x1 + 6} ${mid - 8})`}>FRONT</text>
    </svg>
  );
}
