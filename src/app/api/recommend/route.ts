import { NextResponse } from "next/server";
import { recommendFlights, predictReturn } from "@/lib/recommend/engine";
import { DEMO_TRAVELERS, getDemoTraveler } from "@/lib/recommend/demoTravelers";
import { getLegs } from "@/lib/store";
import type { TravelerProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const travelerId = searchParams.get("traveler");
  const preferPython = searchParams.get("python") === "1";

  const profile = getDemoTraveler(travelerId);
  const legs = await getLegs();
  const recommendations = await recommendFlights(profile, legs, new Date(), {
    preferPython,
  });
  const prediction = recommendations[0]?.prediction ??
    (await predictReturn(profile, new Date(), { preferPython }));

  return NextResponse.json({
    travelers: DEMO_TRAVELERS.map((t) => ({
      id: t.id,
      displayName: t.displayName,
      homeAirport: t.homeAirport,
      currentAirport: t.currentAirport,
    })),
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      homeAirport: profile.homeAirport,
      currentAirport: profile.currentAirport,
    },
    prediction,
    recommendations,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    profile?: TravelerProfile;
    traveler?: string;
    preferPython?: boolean;
  };

  const profile = body.profile ?? getDemoTraveler(body.traveler);
  if (!profile.homeAirport) {
    return NextResponse.json(
      { error: "profile.homeAirport required" },
      { status: 400 },
    );
  }

  const legs = await getLegs();
  const recommendations = await recommendFlights(
    profile,
    legs,
    new Date(),
    { preferPython: body.preferPython === true },
  );
  const prediction =
    recommendations[0]?.prediction ??
    (await predictReturn(profile, new Date(), {
      preferPython: body.preferPython === true,
    }));

  return NextResponse.json({ prediction, recommendations });
}
