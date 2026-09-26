import { NextResponse } from "next/server";
import { fetchCarbonIntensity } from "@/lib/data/regions/uk";

export async function GET() {
  const data = await fetchCarbonIntensity();
  if (!data?.generation_mix) {
    return NextResponse.json({ detail: "Generation mix unavailable" }, { status: 503 });
  }
  return NextResponse.json({
    mix: data.generation_mix,
    intensity_gco2_kwh: data.intensity_gco2_kwh,
    index: data.index,
    source: "carbonintensity.org.uk",
    data_mode: "live",
  });
}
