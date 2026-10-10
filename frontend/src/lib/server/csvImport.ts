import type { AssetType, NewAssetInput } from "@/lib/server/assetsStore";

/**
 * CSV asset importer — the first "connect your own data" path (no hardware,
 * no API key). Parses a pasted/uploaded CSV of an operator's asset list into
 * validated NewAssetInput rows, reporting per-row errors so nothing fails silently.
 */
export interface CsvParseResult {
  rows: NewAssetInput[];
  errors: string[];
  totalDataRows: number;
}

const TYPE_ALIASES: Record<string, AssetType> = {
  "ev charger": "EV Charger", "ev": "EV Charger", "charger": "EV Charger",
  "charge point": "EV Charger", "chargepoint": "EV Charger", "evse": "EV Charger",
  battery: "Battery", storage: "Battery", bess: "Battery",
  solar: "Solar", pv: "Solar", "solar pv": "Solar",
};

/** Minimal RFC-4180-ish line splitter: handles quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_MAP: Record<string, keyof NewAssetInput> = {
  name: "name", "asset name": "name", asset: "name",
  type: "type", "asset type": "type", category: "type",
  site: "site", location: "site", "site name": "site",
  "capacity_kw": "capacity_kw", capacity: "capacity_kw", "capacity kw": "capacity_kw", kw: "capacity_kw",
  manufacturer: "manufacturer", make: "manufacturer",
  model: "model",
  serial_number: "serial_number", "serial number": "serial_number", serial: "serial_number",
  installed_at: "installed_at", "installed on": "installed_at", "install date": "installed_at",
};

export function parseAssetsCsv(text: string, maxRows = 500): CsvParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."], totalDataRows: 0 };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx: Partial<Record<keyof NewAssetInput, number>> = {};
  header.forEach((h, i) => {
    const field = HEADER_MAP[h];
    if (field && idx[field] === undefined) idx[field] = i;
  });

  const missing = (["name", "type", "site", "capacity_kw"] as const).filter((f) => idx[f] === undefined);
  if (missing.length) {
    return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}. Expected: name, type, site, capacity_kw.`], totalDataRows: lines.length - 1 };
  }

  const rows: NewAssetInput[] = [];
  const dataLines = lines.slice(1);
  for (let r = 0; r < dataLines.length; r++) {
    if (rows.length >= maxRows) {
      errors.push(`Row limit reached (${maxRows}); remaining rows were skipped.`);
      break;
    }
    const cells = splitCsvLine(dataLines[r]);
    const rowNo = r + 2; // 1-based, accounting for header
    const name = (cells[idx.name!] ?? "").slice(0, 120);
    const site = (cells[idx.site!] ?? "").slice(0, 120);
    const rawType = (cells[idx.type!] ?? "").toLowerCase();
    const type = TYPE_ALIASES[rawType];
    const capacity = Number(cells[idx.capacity_kw!]);
    const manufacturer = idx.manufacturer !== undefined ? (cells[idx.manufacturer] ?? "").trim().slice(0, 120) : "";
    const model = idx.model !== undefined ? (cells[idx.model] ?? "").trim().slice(0, 120) : "";
    const serial_number = idx.serial_number !== undefined ? (cells[idx.serial_number] ?? "").trim().slice(0, 120) : "";
    const installed_at = idx.installed_at !== undefined ? (cells[idx.installed_at] ?? "").trim() : "";

    if (!name || !site) { errors.push(`Row ${rowNo}: name and site are required.`); continue; }
    if (!type) { errors.push(`Row ${rowNo}: unknown type "${cells[idx.type!] ?? ""}" (use EV Charger, Battery or Solar — add vehicles with Add device).`); continue; }
    if (!Number.isFinite(capacity) || capacity <= 0) { errors.push(`Row ${rowNo}: capacity_kw must be a positive number.`); continue; }
    if (installed_at && Number.isNaN(new Date(installed_at).getTime())) { errors.push(`Row ${rowNo}: installed_at "${installed_at}" is not a valid date.`); continue; }

    rows.push({
      name, type, site, capacity_kw: Math.min(capacity, 100_000),
      manufacturer: manufacturer || undefined,
      model: model || undefined,
      serial_number: serial_number || undefined,
      installed_at: installed_at || undefined,
    });
  }

  return { rows, errors, totalDataRows: dataLines.length };
}

/**
 * CSV readings importer — the second "connect your own data" path, for
 * ongoing/historical usage rather than one-off asset registration. Structural
 * parsing only (column resolution, asset-name lookup, number parsing);
 * business validation (non-negative, real timestamp) is deliberately left to
 * ingestReading() in assetReadings.ts so there's one place that rule lives,
 * not two copies that can drift.
 */
export interface ReadingsCsvRow {
  assetId: string;
  assetName: string;
  power_kw?: number;
  energy_kwh?: number;
  recorded_at: string;
}
export interface ReadingsCsvParseResult {
  rows: ReadingsCsvRow[];
  errors: string[];
  totalDataRows: number;
}

const READING_HEADER_MAP: Record<string, "assetName" | "power_kw" | "energy_kwh" | "recorded_at"> = {
  asset: "assetName", "asset name": "assetName", "asset_name": "assetName", name: "assetName",
  power_kw: "power_kw", power: "power_kw", "power kw": "power_kw", kw: "power_kw",
  energy_kwh: "energy_kwh", energy: "energy_kwh", "energy kwh": "energy_kwh", kwh: "energy_kwh",
  recorded_at: "recorded_at", timestamp: "recorded_at", time: "recorded_at", date: "recorded_at", "date/time": "recorded_at",
};

/** assetsByName: lowercase asset name -> ids sharing that name (ambiguous if >1) — the
 * caller resolves this from the org's own asset list; this parser has no DB access. */
export function parseReadingsCsv(text: string, assetsByName: Map<string, string[]>, maxRows = 1000): ReadingsCsvParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."], totalDataRows: 0 };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx: Partial<Record<"assetName" | "power_kw" | "energy_kwh" | "recorded_at", number>> = {};
  header.forEach((h, i) => {
    const field = READING_HEADER_MAP[h];
    if (field && idx[field] === undefined) idx[field] = i;
  });

  const missing = (["assetName", "recorded_at"] as const).filter((f) => idx[f] === undefined);
  if (missing.length) {
    return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}. Expected: asset_name, recorded_at, and power_kw and/or energy_kwh.`], totalDataRows: lines.length - 1 };
  }
  if (idx.power_kw === undefined && idx.energy_kwh === undefined) {
    return { rows: [], errors: ["CSV needs at least one of the columns power_kw or energy_kwh."], totalDataRows: lines.length - 1 };
  }

  const rows: ReadingsCsvRow[] = [];
  const dataLines = lines.slice(1);
  for (let r = 0; r < dataLines.length; r++) {
    if (rows.length >= maxRows) {
      errors.push(`Row limit reached (${maxRows}); remaining rows were skipped.`);
      break;
    }
    const cells = splitCsvLine(dataLines[r]);
    const rowNo = r + 2;
    const assetName = (cells[idx.assetName!] ?? "").trim();
    const recorded_at = (cells[idx.recorded_at!] ?? "").trim();
    const powerCell = idx.power_kw !== undefined ? (cells[idx.power_kw] ?? "").trim() : "";
    const energyCell = idx.energy_kwh !== undefined ? (cells[idx.energy_kwh] ?? "").trim() : "";

    if (!assetName) { errors.push(`Row ${rowNo}: asset name is required.`); continue; }
    const ids = assetsByName.get(assetName.toLowerCase());
    if (!ids || ids.length === 0) { errors.push(`Row ${rowNo}: no asset named "${assetName}" found.`); continue; }
    if (ids.length > 1) { errors.push(`Row ${rowNo}: "${assetName}" matches more than one asset — rename one to disambiguate.`); continue; }
    if (!recorded_at) { errors.push(`Row ${rowNo}: recorded_at is required.`); continue; }
    if (!powerCell && !energyCell) { errors.push(`Row ${rowNo}: at least one of power_kw or energy_kwh is required.`); continue; }

    const power_kw = powerCell ? Number(powerCell) : undefined;
    if (powerCell && !Number.isFinite(power_kw)) { errors.push(`Row ${rowNo}: power_kw "${powerCell}" is not a number.`); continue; }
    const energy_kwh = energyCell ? Number(energyCell) : undefined;
    if (energyCell && !Number.isFinite(energy_kwh)) { errors.push(`Row ${rowNo}: energy_kwh "${energyCell}" is not a number.`); continue; }

    rows.push({ assetId: ids[0], assetName, power_kw, energy_kwh, recorded_at });
  }

  return { rows, errors, totalDataRows: dataLines.length };
}
