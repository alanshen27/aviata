import { findAirport } from "../airports";
import type {
  EmptyLegCandidate,
  FlightRecommendation,
  ReturnPrediction,
  TravelerProfile,
} from "../types";
import {
  airportLabel,
  daysAwayNow,
  inferStayStats,
  normalizeCode,
} from "./patterns";
import { scoreReturnIntent } from "./sequenceModel";

export async function predictReturn(
  profile: TravelerProfile,
  now = new Date(),
  opts?: { preferPython?: boolean },
): Promise<ReturnPrediction> {
  const home = normalizeCode(profile.homeAirport);
  const current = normalizeCode(
    profile.currentAirport ??
      profile.trips
        .slice()
        .sort(
          (a, b) =>
            new Date(b.departedAt).getTime() - new Date(a.departedAt).getTime(),
        )[0]?.destination ??
      home,
  );
  const stats = inferStayStats(profile);
  const daysAway = daysAwayNow(profile, now);
  const model = await scoreReturnIntent(
    profile,
    {
      daysAway,
      predictedStayDays: stats.medianStayDays,
      home,
      current,
    },
    opts,
  );

  const recommendInDays = Math.max(
    0,
    Math.round((stats.medianStayDays - daysAway) * 10) / 10,
  );

  const reason =
    current === home
      ? `Based at ${airportLabel(home)}. No return window — watching outbound corridors (${stats.commonDestinations
          .slice(0, 2)
          .map(airportLabel)
          .join(", ") || "history growing"}).`
      : `Home ${airportLabel(home)}, now in ${airportLabel(current)} for ${daysAway.toFixed(1)} days. Past trips stay ~${stats.medianStayDays} days — ${
          recommendInDays <= 1
            ? "return window is open"
            : `suggest return in ~${recommendInDays} days`
        }.`;

  return {
    homeAirport: home,
    currentAirport: current,
    daysAway: round3(daysAway),
    predictedStayDays: stats.medianStayDays,
    returnProbability: model.returnProbability,
    recommendInDays,
    reason,
    backend: model.backend,
  };
}

export async function recommendFlights(
  profile: TravelerProfile,
  legs: EmptyLegCandidate[],
  now = new Date(),
  opts?: { preferPython?: boolean },
): Promise<FlightRecommendation[]> {
  const prediction = await predictReturn(profile, now, opts);
  const home = prediction.homeAirport;
  const current = prediction.currentAirport;
  const out: FlightRecommendation[] = [];

  for (const leg of legs) {
    const origin = normalizeCode(leg.origin.iata ?? leg.origin.icao);
    const dest = normalizeCode(leg.destination.iata ?? leg.destination.icao);

    let kind: FlightRecommendation["kind"] | null = null;
    let reason = "";
    let score = 0;

    if (current !== home && dest === home) {
      // Homebound empty leg from anywhere — prefer from current city/region.
      const fromCurrent = origin === current || sameMetro(origin, current);
      const timingBoost =
        prediction.recommendInDays <= 2
          ? 0.35
          : prediction.recommendInDays <= 5
            ? 0.15
            : 0.05;
      kind = "return_home";
      score =
        0.25 +
        prediction.returnProbability * 0.45 +
        timingBoost +
        (fromCurrent ? 0.2 : 0.05) +
        leg.confidence * 0.1;
      reason = fromCurrent
        ? `Matches your return pattern ${airportLabel(current)} → ${airportLabel(home)} after ~${prediction.predictedStayDays}-day trips.`
        : `Homebound toward ${airportLabel(home)} while you're still in ${airportLabel(current)} (connect/reposition option).`;
    } else if (
      current === home &&
      origin === home &&
      prediction.returnProbability < 0.45
    ) {
      kind = "next_corridor";
      score = 0.3 + leg.confidence * 0.3;
      reason = `Outbound from home ${airportLabel(home)} — ranked for explorers between trips.`;
    } else if (
      current !== home &&
      origin === current &&
      dest !== home &&
      prediction.recommendInDays > 3
    ) {
      kind = "explore";
      score = 0.2 + leg.confidence * 0.25;
      reason = `Still mid-trip (return ~${prediction.recommendInDays}d). Side-hop from ${airportLabel(current)}.`;
    }

    if (!kind) continue;

    out.push({
      id: `rec_${profile.id}_${leg.id}`,
      score: round3(Math.min(0.99, score)),
      kind,
      reason,
      prediction,
      leg,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function sameMetro(a: string, b: string): boolean {
  const metro: Record<string, string> = {
    PVG: "SHA_METRO",
    SHA: "SHA_METRO",
    PEK: "BJ_METRO",
    PKX: "BJ_METRO",
  };
  return (metro[a] ?? a) === (metro[b] ?? b);
}

export function resolveAirportOrThrow(code: string) {
  const a = findAirport(code);
  if (!a) throw new Error(`Unknown airport: ${code}`);
  return a;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
