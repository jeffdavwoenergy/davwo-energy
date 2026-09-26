import { NextResponse } from "next/server";
import { fetchOctopusAgile } from "@/lib/data/regions/uk";

export async function GET() {
  const data = await fetchOctopusAgile();
  if (!data) return NextResponse.json({ detail: "Pricing unavailable" }, { status: 503 });
  return NextResponse.json({ ...data, source: "octopus.energy (Agile)", data_mode: "live" });
}
