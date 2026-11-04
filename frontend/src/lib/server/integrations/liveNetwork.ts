// Builds the ANI engine's Network (stations → ports → hourly readings) from
// real integrated EV-charger history — the swap dataGenerator.ts was designed
// for ("the shape stays the same"). Every engine feature (monitoring,
// insights, forecasts, backtests, optimisation) then runs on real telemetry
// for live orgs with no changes to the engine itself.
//
// Mapping: one station per site, one port per charger. Per hour: energy is the
// hour's measured mean kW (= kWh), utilisation is that over the charger's
// rating, a session starts on each transition into "charging", and a charger
// reporting a fault status for the hour is faulted (and so offline).

import type { Network, Reading, Station } from "@/lib/ani/dataGenerator";
import type { DiscoveredDevice } from "@/lib/server/integrations/victron";
import { isEvcsFault } from "@/lib/server/integrations/victron";

const CHARGING = 2;
const round = (x: number, n = 4) => +x.toFixed(n);

type EvDevice = DiscoveredDevice & { assetId: string };

/** "LIVE-01-47" — station id + the provider's device number (VRM instance). */
const portId = (stationId: string, d: EvDevice) => `${stationId}-${d.externalId.split(":").pop()}`;

export function buildLiveNetwork(devices: (DiscoveredDevice & { assetId: string })[]): Network {
  const evs = devices.filter((d): d is EvDevice => d.type === "EV Charger");
  const bySite = new Map<string, EvDevice[]>();
  for (const d of evs) bySite.set(d.site, [...(bySite.get(d.site) ?? []), d]);

  const stations: Station[] = [...bySite.entries()].map(([site, chargers], si) => {
    const id = `LIVE-${String(si + 1).padStart(2, "0")}`;
    const loc = chargers.find((c) => c.location)?.location ?? { lat: 0, lng: 0 };
    return {
      id,
      name: site,
      location: loc,
      capacityKw: chargers.reduce((s, c) => s + c.capacityKw, 0),
      // Port ids appear in engine insight labels ("Site / Port (id)"), so
      // they're short and readable rather than internal asset ids.
      ports: chargers.map((c) => ({
        id: portId(id, c),
        stationId: id,
        label: c.name.split(" · ").pop() ?? c.name,
        ratedKw: c.capacityKw,
        faultProb: 0,
      })),
    };
  });

  // Common hour grid across all chargers, so every port has a reading at
  // every timestamp (the engine compares ports at the same ts). An hour a
  // charger has no data for is recorded as offline, not as idle.
  const hours = [...new Set(evs.flatMap((d) => d.history.map((h) => h.ts)))].sort((a, b) => a - b);
  const readings: Reading[] = [];
  for (const st of stations) {
    for (const port of st.ports) {
      const dev = evs.find((d) => portId(st.id, d) === port.id)!;
      const byTs = new Map(dev.history.map((h) => [h.ts, h]));
      let prevCharging = false;
      for (const ts of hours) {
        const d = new Date(ts);
        const h = byTs.get(ts);
        const code = h?.statusCode;
        const faulted = code != null && isEvcsFault(code);
        const energyKwh = h && !faulted ? h.energyKwh : 0;
        const charging = code != null ? code === CHARGING : energyKwh > 0.05;
        readings.push({
          ts,
          dateStr: d.toISOString().slice(0, 10),
          hour: d.getUTCHours(),
          dow: d.getUTCDay(),
          stationId: st.id,
          portId: port.id,
          online: Boolean(h) && !faulted,
          faulted,
          utilisation: port.ratedKw > 0 ? round(Math.min(1, energyKwh / port.ratedKw)) : 0,
          energyKwh: round(energyKwh, 2),
          sessions: charging && !prevCharging ? 1 : 0,
        });
        prevCharging = charging;
      }
    }
  }

  const rangeDays = hours.length ? Math.max(1, Math.round((hours[hours.length - 1] - hours[0]) / 86_400_000) + 1) : 0;
  return {
    generatedAt: new Date(hours.length ? hours[hours.length - 1] : Date.now()).toISOString(),
    rangeDays,
    seed: 0,
    stations,
    readings,
  };
}
