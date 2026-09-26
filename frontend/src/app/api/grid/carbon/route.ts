import { NextResponse } from "next/server";
import { fetchCarbonIntensity } from "@/lib/data/regions/uk";

export async function GET() {
  const data = await fetchCarbonIntensity();
  if (!data) return NextResponse.json({ detail: "Carbon intensity unavailable" }, { status: 503 });
  return NextResponse.json({ ...data, source: "carbonintensity.org.uk", data_mode: "live" });
}
