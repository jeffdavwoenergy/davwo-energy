import { generateNetwork, type Network } from "./dataGenerator";
import { currentSeed, currentOrg } from "@/lib/server/context";
import { liveSnapshot } from "@/lib/server/integrations/sync";

// Generate each tenant's seeded network once per hour per server instance.
// Keyed by seed so different orgs get isolated, stable networks.
const cache = new Map<number, { net: Network; hour: number }>();

/** The current org's EV network: built from its real integrated chargers when
 * it has a live snapshot (see integrations/sync.ts), otherwise the seeded
 * synthetic demo network. An explicit seed always means the synthetic one. */
export function getNetwork(seed?: number): Network {
  if (seed === undefined) {
    const live = liveSnapshot(currentOrg());
    if (live) return live.network;
  }
  const s = seed ?? currentSeed();
  const hour = Math.floor(Date.now() / 3_600_000);
  const cached = cache.get(s);
  if (cached && cached.hour === hour) return cached.net;
  const net = generateNetwork({ seed: s, days: 60 });
  cache.set(s, { net, hour });
  return net;
}
