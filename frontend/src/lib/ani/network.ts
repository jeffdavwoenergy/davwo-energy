import { generateNetwork, type Network } from "./dataGenerator";
import { currentSeed } from "@/lib/server/context";

// Generate each tenant's seeded network once per hour per server instance.
// Keyed by seed so different orgs get isolated, stable networks.
const cache = new Map<number, { net: Network; hour: number }>();

export function getNetwork(seed: number = currentSeed()): Network {
  const hour = Math.floor(Date.now() / 3_600_000);
  const cached = cache.get(seed);
  if (cached && cached.hour === hour) return cached.net;
  const net = generateNetwork({ seed, days: 60 });
  cache.set(seed, { net, hour });
  return net;
}
