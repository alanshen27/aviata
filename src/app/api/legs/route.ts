import { NextResponse } from "next/server";
import { getLegs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minConfidence = Number(searchParams.get("minConfidence") ?? "0");
  const origin = searchParams.get("origin")?.toUpperCase();
  const destination = searchParams.get("destination")?.toUpperCase();

  let legs = await getLegs();
  if (minConfidence > 0) {
    legs = legs.filter((l) => l.confidence >= minConfidence);
  }
  if (origin) {
    legs = legs.filter(
      (l) =>
        l.origin.iata === origin ||
        l.origin.icao === origin ||
        l.origin.icao === `K${origin}`,
    );
  }
  if (destination) {
    legs = legs.filter(
      (l) =>
        l.destination.iata === destination ||
        l.destination.icao === destination ||
        l.destination.icao === `K${destination}`,
    );
  }

  return NextResponse.json({
    count: legs.length,
    legs,
    models: {
      ensemble: "0.45*xgb + 0.35*lstm + 0.20*heuristic",
      features: "OSINT ADS-B derived tabular + sequence vectors",
    },
  });
}
