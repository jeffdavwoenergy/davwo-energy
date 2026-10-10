// Per-device-type asset fields, shared by the Assets "Add device" form (which
// renders them) and the assets API (which validates them). Runtime-light and
// server-free so client bundles can import it.

export type AssetType = "EV Charger" | "Battery" | "Solar" | "Vehicle";
export const ASSET_TYPES: AssetType[] = ["EV Charger", "Solar", "Battery", "Vehicle"];

export type VehicleKind = "car" | "van" | "bus" | "truck";
export const VEHICLE_KINDS: { id: VehicleKind; label: string }[] = [
  { id: "car", label: "Car" },
  { id: "van", label: "Van" },
  { id: "bus", label: "Bus / coach" },
  { id: "truck", label: "Truck / HGV" },
];

/** Energy Devices switcher id ↔ asset type. */
export const DEVICE_ASSET_TYPE = { ev: "EV Charger", solar: "Solar", battery: "Battery", fleet: "Vehicle" } as const;

export type SpecValue = string | number;
export type AssetSpecs = Record<string, SpecValue>;

export interface SpecField {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: { id: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
}

interface TypeMeta {
  /** What the shared capacity_kw column means for this type. */
  capacityLabel: string;
  capacityHint: string;
  /** Default wording for the shared "site" column. */
  siteLabel: string;
  fields: SpecField[];
}

export const ASSET_TYPE_META: Record<AssetType, TypeMeta> = {
  "EV Charger": {
    capacityLabel: "Max output (kW)",
    capacityHint: "e.g. 7, 22, 50, 150",
    siteLabel: "Site",
    fields: [
      { key: "ports", label: "Ports", kind: "number", min: 1, max: 64, placeholder: "2" },
      { key: "connectors", label: "Connector types", kind: "text", placeholder: "Type 2, CCS2" },
      { key: "ocppId", label: "OCPP charge point ID", kind: "text", placeholder: "CP-0001" },
    ],
  },
  Solar: {
    capacityLabel: "System size (kWp)",
    capacityHint: "Peak DC capacity of the array",
    siteLabel: "Site",
    fields: [
      { key: "panelCount", label: "Panel count", kind: "number", min: 1, max: 100000, placeholder: "120" },
      { key: "inverter", label: "Inverter make / model", kind: "text", placeholder: "SolarEdge SE50K" },
      {
        key: "orientation", label: "Orientation", kind: "select",
        options: ["South", "South-east", "South-west", "East", "West", "East-west split", "North"].map((o) => ({ id: o, label: o })),
      },
      { key: "tiltDeg", label: "Tilt", kind: "number", unit: "°", min: 0, max: 90, placeholder: "30" },
    ],
  },
  Battery: {
    capacityLabel: "Power rating (kW)",
    capacityHint: "Max charge / discharge power",
    siteLabel: "Site",
    fields: [
      { key: "capacityKwh", label: "Storage capacity", kind: "number", unit: "kWh", min: 1, max: 1000000, placeholder: "215" },
      {
        key: "chemistry", label: "Chemistry", kind: "select",
        options: ["LFP", "NMC", "Sodium-ion", "Lead-acid", "Other"].map((o) => ({ id: o, label: o })),
      },
    ],
  },
  Vehicle: {
    capacityLabel: "Max charge rate (kW)",
    capacityHint: "Fastest rate the vehicle accepts, e.g. 11 AC or 130 DC",
    siteLabel: "Home depot",
    fields: [
      { key: "vehicleType", label: "Vehicle type", kind: "select", options: VEHICLE_KINDS, required: true },
      { key: "reg", label: "Registration", kind: "text", required: true, placeholder: "AB12 CDE" },
      { key: "vin", label: "VIN", kind: "text", placeholder: "17 characters" },
      { key: "batteryKwh", label: "Battery size", kind: "number", unit: "kWh", min: 5, max: 1500, required: true, placeholder: "75" },
      { key: "rangeMiles", label: "Official range", kind: "number", unit: "mi", min: 10, max: 1000, placeholder: "220" },
      { key: "driver", label: "Assigned driver", kind: "text", placeholder: "Driver name or ID" },
    ],
  },
};

const MAX_TEXT = 120;

/** Validates and normalises specs for a type: unknown keys are dropped,
 * numbers coerced and range-checked, selects limited to their options.
 * `partial` skips the required check (for PATCH merges). */
export function parseSpecs(
  type: AssetType,
  raw: unknown,
  { partial = false }: { partial?: boolean } = {},
): { specs: AssetSpecs; error?: string } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const specs: AssetSpecs = {};
  for (const f of ASSET_TYPE_META[type].fields) {
    const v = input[f.key];
    const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (empty) {
      if (f.required && !partial) return { specs, error: `${f.label} is required` };
      continue;
    }
    if (f.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return { specs, error: `${f.label} must be a number` };
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) {
        return { specs, error: `${f.label} must be between ${f.min} and ${f.max}` };
      }
      specs[f.key] = n;
    } else if (f.kind === "select") {
      const s = String(v);
      if (!f.options?.some((o) => o.id === s)) return { specs, error: `${f.label} is not a valid option` };
      specs[f.key] = s;
    } else {
      specs[f.key] = String(v).trim().slice(0, MAX_TEXT);
    }
  }
  return { specs };
}

export function vehicleKindOf(specs: AssetSpecs | undefined): VehicleKind {
  const k = specs?.vehicleType;
  return VEHICLE_KINDS.some((v) => v.id === k) ? (k as VehicleKind) : "van";
}
