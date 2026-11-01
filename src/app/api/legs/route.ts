import { NextResponse } from "next/server";
import { getLiveLegs } from "@/lib/listings";
import { haversineKm } from "@/lib/airportTable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin")?.toUpperCase();
  const destination = searchParams.get("destination")?.toUpperCase();
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const radiusKm = Number(searchParams.get("radiusKm") ?? "800");
  const minSeats = Number(searchParams.get("minSeats") ?? "0");

  let legs = await getLiveLegs(searchParams.get("refresh") === "1");
  if (origin) legs = legs.filter((l) => l.origin.code === origin || l.origin.icao === origin);
  if (destination) {
    legs = legs.filter((l) => l.destination.code === destination || l.destination.icao === destination);
  }
  if (minSeats > 0) legs = legs.filter((l) => (l.seats ?? 99) >= minSeats);
  if (Number.isFinite(lat) && Number.isFinite(lon) && searchParams.has("lat")) {
    legs = legs
      .map((l) => ({
        leg: l,
        d: Math.min(
          haversineKm(lat, lon, l.origin.lat, l.origin.lon),
          haversineKm(lat, lon, l.destination.lat, l.destination.lon),
        ),
      }))
      .filter((x) => x.d <= radiusKm)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.leg);
  }

  return NextResponse.json({
    count: legs.length,
    source: "thelimitlesssky.com public RSS",
    legs,
  });
}
