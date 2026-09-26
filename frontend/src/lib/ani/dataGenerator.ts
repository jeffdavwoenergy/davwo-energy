// Synthetic EV-charging network generator (ported from davwo-ani).
// There is no real charger telemetry yet, so this produces realistic, REPRODUCIBLE
// data with deliberate patterns the ANI engine can find. Swap for OCPP later — the
// shape (stations/ports/readings) stays the same.

import { createRng } from "./rng";

// Demand shape across a day (index = hour 0..23): morning + evening commuter peaks.
export const HOUR_PROFILE = [
  0.08, 0.05, 0.04, 0.04, 0.05, 0.1, 0.25, 0.55, 0.7, 0.55, 0.45, 0.5, 0.55, 0.5,
  0.48, 0.55, 0.75, 0.92, 0.95, 0.8, 0.55, 0.4, 0.25, 0.15,
];

type WeekendProfile = "commuter" | "flat" | "retail";

interface Blueprint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  popularity: number;
  rising: boolean;
  weekendProfile: WeekendProfile;
  faultyPortIndex?: number;
  ports: { ratedKw: number }[];
}

export const STATION_BLUEPRINTS: Blueprint[] = [
  { id: "ST-01", name: "Westfield Hub", lat: 51.507, lng: -0.224, popularity: 1.0, rising: true, weekendProfile: "commuter", ports: [{ ratedKw: 150 }, { ratedKw: 150 }, { ratedKw: 50 }, { ratedKw: 50 }] },
  { id: "ST-02", name: "Riverside Point", lat: 51.486, lng: -0.124, popularity: 0.16, rising: false, weekendProfile: "commuter", ports: [{ ratedKw: 7 }, { ratedKw: 7 }] },
  { id: "ST-03", name: "Central Depot", lat: 51.514, lng: -0.105, popularity: 0.58, rising: false, faultyPortIndex: 1, weekendProfile: "commuter", ports: [{ ratedKw: 22 }, { ratedKw: 22 }, { ratedKw: 22 }] },
  { id: "ST-04", name: "Airport Park", lat: 51.47, lng: -0.454, popularity: 0.88, rising: false, weekendProfile: "flat", ports: [{ ratedKw: 50 }, { ratedKw: 50 }] },
  { id: "ST-05", name: "Northgate", lat: 51.535, lng: -0.108, popularity: 0.5, rising: false, weekendProfile: "commuter", ports: [{ ratedKw: 22 }, { ratedKw: 22 }] },
  { id: "ST-06", name: "Harbour Mall", lat: 51.503, lng: -0.011, popularity: 0.62, rising: false, weekendProfile: "retail", ports: [{ ratedKw: 50 }, { ratedKw: 50 }, { ratedKw: 22 }] },
];

export interface Port {
  id: string;
  stationId: string;
  label: string;
  ratedKw: number;
  faultProb: number;
}

export interface Station {
  id: string;
  name: string;
  location: { lat: number; lng: number };
  capacityKw: number;
  ports: Port[];
}

export interface Reading {
  ts: number;
  dateStr: string;
  hour: number;
  dow: number;
  stationId: string;
  portId: string;
  online: boolean;
  faulted: boolean;
  utilisation: number;
  energyKwh: number;
  sessions: number;
}

export interface Network {
  generatedAt: string;
  rangeDays: number;
  seed: number;
  stations: Station[];
  readings: Reading[];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function dowFactor(profile: WeekendProfile, dow: number): number {
  const isWeekend = dow === 0 || dow === 6;
  if (profile === "flat") return isWeekend ? 0.9 : 1.0;
  if (profile === "retail") return dow === 6 ? 1.15 : dow === 0 ? 1.0 : 0.72;
  return isWeekend ? (dow === 6 ? 0.7 : 0.55) : 1.0;
}

export function generateNetwork(opts: { seed?: number; days?: number; endDate?: Date } = {}): Network {
  const seed = opts.seed ?? 42;
  const days = opts.days ?? 60;
  const endDate = opts.endDate ?? new Date();
  const rng = createRng(seed);

  const stations = STATION_BLUEPRINTS.map((bp) => ({
    id: bp.id,
    name: bp.name,
    location: { lat: bp.lat, lng: bp.lng },
    capacityKw: bp.ports.reduce((s, p) => s + p.ratedKw, 0),
    ports: bp.ports.map((p, i) => ({
      id: `${bp.id}-P${i + 1}`,
      stationId: bp.id,
      label: `Port ${String.fromCharCode(65 + i)}`,
      ratedKw: p.ratedKw,
      faultProb: bp.faultyPortIndex === i ? 0.06 : 0.004,
    })),
    _bp: bp,
  }));

  const readings: Reading[] = [];
  const totalHours = days * 24;
  const endMs = Math.floor(endDate.getTime() / 3_600_000) * 3_600_000;
  const startMs = endMs - (totalHours - 1) * 3_600_000;

  for (let h = 0; h < totalHours; h++) {
    const ts = startMs + h * 3_600_000;
    const d = new Date(ts);
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();
    const dateStr = d.toISOString().slice(0, 10);
    const progress = h / totalHours;

    for (const st of stations) {
      const bp = st._bp;
      const trend = bp.rising ? 0.7 + 0.65 * progress : 1 + 0.06 * progress;
      const dayMul = dowFactor(bp.weekendProfile, dow);
      const hourMul = HOUR_PROFILE[hour];

      for (const port of st.ports) {
        const faulted = rng.chance(port.faultProb);
        let utilisation = 0;
        let energyKwh = 0;
        let sessions = 0;

        if (!faulted) {
          const noise = 1 + rng.normal() * 0.12;
          utilisation = clamp01(bp.popularity * hourMul * dayMul * trend * noise);
          energyKwh = +(utilisation * port.ratedKw).toFixed(2);
          sessions = Math.max(
            0,
            Math.round(utilisation * (port.ratedKw >= 50 ? 2.4 : 1.3) + rng.normal() * 0.3),
          );
        }

        readings.push({
          ts, dateStr, hour, dow,
          stationId: st.id,
          portId: port.id,
          online: !faulted,
          faulted,
          utilisation: +utilisation.toFixed(4),
          energyKwh,
          sessions,
        });
      }
    }
  }

  const cleanStations: Station[] = stations.map(({ _bp, ...rest }) => {
    void _bp;
    return rest;
  });

  return {
    generatedAt: new Date(endMs).toISOString(),
    rangeDays: days,
    seed,
    stations: cleanStations,
    readings,
  };
}
