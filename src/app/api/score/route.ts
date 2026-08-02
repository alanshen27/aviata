import { NextResponse } from "next/server";
import { findAirport } from "@/lib/airports";
import { detectEmptyLeg } from "@/lib/detector";
import { FEATURE_NAMES } from "@/lib/features";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    icao24?: string;
    registration?: string;
    typecode?: string;
    origin?: string;
    destination?: string;
    groundTimeHours?: number;
    priorOrigin?: string;
    priorDestination?: string;
    oneWayRatio7d?: number;
    legsLast48h?: number;
    departInHours?: number;
  };

  const origin = body.origin ? findAirport(body.origin) : undefined;
  const destination = body.destination
    ? findAirport(body.destination)
    : undefined;

  if (
    !body.icao24 ||
    !body.registration ||
    !body.typecode ||
    !origin ||
    !destination
  ) {
    return NextResponse.json(
      {
        error:
          "icao24, registration, typecode, origin, destination are required (known airport codes)",
      },
      { status: 400 },
    );
  }

  const result = await detectEmptyLeg({
    icao24: body.icao24,
    registration: body.registration,
    typecode: body.typecode,
    origin,
    destination,
    estimatedDeparture: new Date(
      Date.now() + (body.departInHours ?? 4) * 3600_000,
    ),
    groundTimeHours: body.groundTimeHours ?? 4,
    priorOrigin: body.priorOrigin
      ? findAirport(body.priorOrigin)
      : undefined,
    priorDestination: body.priorDestination
      ? findAirport(body.priorDestination)
      : undefined,
    oneWayRatio7d: body.oneWayRatio7d ?? 0.6,
    legsLast48h: body.legsLast48h ?? 2,
    source: "demo",
    minConfidence: 0,
    preferPython: true,
  });

  return NextResponse.json({
    featureNames: FEATURE_NAMES,
    features: result.features,
    scores: result.scores,
    candidate: result.candidate,
  });
}
