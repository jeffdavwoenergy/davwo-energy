import { describe, it, expect, vi } from "vitest";

let liveSlots: { valid_from: string; pence: number }[] | null = null;
vi.mock("@/lib/data/regions/uk", () => ({
  fetchCarbonIntensity: vi.fn(async () => null),
  fetchCarbonForecast: vi.fn(async () => null),
  fetchOctopusAgile: vi.fn(async () => null),
  fetchOctopusWindow: vi.fn(async () => liveSlots),
  fetchWeather: vi.fn(async () => null),
  fetchChargePoints: vi.fn(async () => null),
  GRID_BASELINE_GCO2: 233,
}));
vi.mock("@/lib/server/llm", () => ({
  isLLMConfigured: () => false,
  callLLM: vi.fn(),
  callLLMStream: vi.fn(),
}));

import { asTenant } from "@/lib/server/context";
import { answer, streamAnswer } from "@/lib/ani/assistant";
import { DEVICE_CAPABILITIES } from "@/lib/ani/deviceCapabilities";
import { DEVICE_PROMPTS } from "@/lib/ani/devicePrompts";
import { POST as chat } from "@/app/api/ani/chat/route";
import { signToken } from "@/lib/server/jwt";
import { addUserAsset } from "@/lib/server/assetsStore";

const org = () => `org-ask-${Math.random().toString(36).slice(2)}`;
const ask = (q: string, device?: "ev" | "fleet" | "solar" | "battery", context?: string, o = org()) =>
  asTenant(o, () => answer(q, context, device));

describe("Ask ANI with a device selected", () => {
  it("routes questions to the selected device's capabilities", async () => {
    expect((await ask("which vehicles won't be ready?", "fleet")).capabilities).toEqual(["fleet_status"]);
    expect((await ask("what's wrong, any faults?", "fleet")).capabilities).toEqual(["fleet_faults"]);
    expect((await ask("when should we charge tonight?", "fleet")).capabilities).toEqual(["fleet_plan"]);
    expect((await ask("how are the solar panels doing?", "solar")).capabilities).toEqual(["solar_status"]);
    expect((await ask("is the battery saving money?", "battery")).capabilities).toEqual(["battery_status"]);
  });

  it("vague questions use the device (and page) default; EV keeps the original behaviour", async () => {
    expect((await ask("hello", "fleet")).capabilities).toEqual(["fleet_status"]);
    expect((await ask("hello", "fleet", "/forecasting")).capabilities).toEqual(["fleet_plan"]);
    expect((await ask("hello", "fleet", "/alerts")).capabilities).toEqual(["fleet_faults"]);
    expect((await ask("hello", "solar", "/forecasting")).capabilities).toEqual(["solar_status"]);
    expect((await ask("hello", "battery")).capabilities).toEqual(["battery_status"]);
    // Device capabilities never leak into EV answers.
    expect((await ask("any faults?", "ev")).capabilities).not.toContain("fleet_faults");
    expect((await ask("any faults?")).capabilities).not.toContain("fleet_faults");
    expect((await ask("hello", "fleet")).blocks[0]).toEqual({ type: "text", text: "Here's the fleet readiness:" });
  });

  it("every device capability builds real blocks, with and without live prices", async () => {
    const o = org();
    for (const withPrices of [false, true]) {
      liveSlots = withPrices ? [{ valid_from: "2026-10-10T01:00:00Z", pence: 8 }, { valid_from: "2026-10-10T17:00:00Z", pence: 38 }] : null;
      for (const c of DEVICE_CAPABILITIES) {
        const blocks = await asTenant(o, () => c.build());
        expect(blocks.length).toBeGreaterThan(0);
      }
    }
    liveSlots = null;
  });

  it("fleet answers cover the all-clear cases too", async () => {
    // A registered, healthy, fully charged-looking fleet of one: no faults,
    // and readiness depends only on its duty cycle.
    const o = org();
    await addUserAsset(o, { name: "Pool car", type: "Vehicle", site: "North Depot", capacity_kw: 350, specs: { vehicleType: "car", reg: "AB12 CDE", batteryKwh: 20 } });
    const status = DEVICE_CAPABILITIES.find((c) => c.id === "fleet_status")!;
    const faults = DEVICE_CAPABILITIES.find((c) => c.id === "fleet_faults")!;
    const s = JSON.stringify(await asTenant(o, () => status.build()));
    expect(s).toMatch(/Every vehicle is on course|Won't be ready/);
    const f = JSON.stringify(await asTenant(o, () => faults.build()));
    expect(f).toMatch(/No open faults|insight/);
  });

  it("prompts exist for every device", () => {
    for (const d of ["fleet", "solar", "battery"] as const) expect(DEVICE_PROMPTS[d]).toHaveLength(3);
  });

  it("the chat API passes the device through", async () => {
    const token = await signToken({ sub: "u", email: "u@x.com", role: "admin", org: org() });
    const res = await chat(new Request("http://x/api/ani/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "what's wrong with the fleet?", context: "/dashboard", device: "fleet" }),
    }));
    const text = await res.text();
    // "fleet" + "wrong" → readiness and faults together
    expect(text).toMatch(/"capabilities":\["fleet_status","fleet_faults"\]|"capabilities":\["fleet_faults","fleet_status"\]/);
    const streamed: string[] = [];
    await asTenant(org(), () => streamAnswer("hello", undefined, (c) => streamed.push(c), "battery"));
    expect(streamed.join("")).toBe("Here's the battery status and plan:");
  });
});

describe("Ask ANI when the price feed fails", () => {
  it("falls back to a typical price spread", async () => {
    const uk = await import("@/lib/data/regions/uk");
    vi.mocked(uk.fetchOctopusWindow).mockRejectedValueOnce(new Error("feed down"));
    const plan = DEVICE_CAPABILITIES.find((c) => c.id === "fleet_plan")!;
    const blocks = await asTenant(org(), () => plan.build());
    expect(blocks[0]).toMatchObject({ type: "kpis" });
  });
});
