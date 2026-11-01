import { NextResponse } from "next/server";
import { searchAirports } from "@/lib/airportTable";

export function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ airports: searchAirports(q, 6) });
}
