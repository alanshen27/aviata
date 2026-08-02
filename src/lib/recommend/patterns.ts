import { findAirport } from "../airports";
import type { TravelerProfile, TravelerTrip } from "../types";

export interface StayStats {
  medianStayDays: number;
  meanStayDays: number;
  sampleSize: number;
  commonDestinations: string[];
}

/** Infer typical stay length from past outbound trips that eventually returned home. */
export function inferStayStats(profile: TravelerProfile): StayStats {
  const home = normalizeCode(profile.homeAirport);
  const stays: number[] = [];
  const destCounts = new Map<string, number>();

  for (const trip of profile.trips) {
    const dest = normalizeCode(trip.destination);
    const origin = normalizeCode(trip.origin);
    if (origin === home && dest !== home) {
      destCounts.set(dest, (destCounts.get(dest) ?? 0) + 1);
      const stay = tripStayDays(trip, home);
      if (stay != null) stays.push(stay);
    }
  }

  // Also pair outbound + later homebound in chronological order.
  if (stays.length === 0) {
    stays.push(...inferStaysFromSequence(profile.trips, home));
  }

  const sorted = [...stays].sort((a, b) => a - b);
  const medianStayDays =
    sorted.length === 0
      ? 7
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const meanStayDays =
    sorted.length === 0
      ? 7
      : sorted.reduce((a, b) => a + b, 0) / sorted.length;

  const commonDestinations = [...destCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);

  return {
    medianStayDays: round1(medianStayDays),
    meanStayDays: round1(meanStayDays),
    sampleSize: sorted.length,
    commonDestinations,
  };
}

export function daysAwayNow(profile: TravelerProfile, now = new Date()): number {
  const home = normalizeCode(profile.homeAirport);
  const current = normalizeCode(
    profile.currentAirport ?? latestDestination(profile) ?? home,
  );
  if (current === home) return 0;

  const arrived = profile.arrivedAtCurrent
    ? new Date(profile.arrivedAtCurrent)
    : latestArrivalAway(profile, home);

  if (!arrived) return 0;
  return Math.max(0, (now.getTime() - arrived.getTime()) / 86_400_000);
}

export function normalizeCode(code: string): string {
  const upper = code.toUpperCase();
  const airport = findAirport(upper);
  return airport?.iata ?? airport?.icao ?? upper;
}

export function airportLabel(code: string): string {
  const a = findAirport(code);
  if (!a) return code.toUpperCase();
  return a.iata ?? a.icao;
}

function tripStayDays(trip: TravelerTrip, home: string): number | undefined {
  if (trip.stayDays != null) return trip.stayDays;
  if (!trip.returnedAt) return undefined;
  const dest = normalizeCode(trip.destination);
  if (dest === home) return undefined;
  const ms =
    new Date(trip.returnedAt).getTime() - new Date(trip.departedAt).getTime();
  if (ms <= 0) return undefined;
  return ms / 86_400_000;
}

function inferStaysFromSequence(
  trips: TravelerTrip[],
  home: string,
): number[] {
  const ordered = [...trips].sort(
    (a, b) =>
      new Date(a.departedAt).getTime() - new Date(b.departedAt).getTime(),
  );
  const stays: number[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const aOrigin = normalizeCode(a.origin);
    const aDest = normalizeCode(a.destination);
    const bDest = normalizeCode(b.destination);
    if (aOrigin === home && aDest !== home && bDest === home) {
      const ms =
        new Date(b.departedAt).getTime() - new Date(a.departedAt).getTime();
      if (ms > 0) stays.push(ms / 86_400_000);
    }
  }
  return stays;
}

function latestDestination(profile: TravelerProfile): string | undefined {
  if (!profile.trips.length) return undefined;
  const last = [...profile.trips].sort(
    (a, b) =>
      new Date(b.departedAt).getTime() - new Date(a.departedAt).getTime(),
  )[0];
  return normalizeCode(last.destination);
}

function latestArrivalAway(
  profile: TravelerProfile,
  home: string,
): Date | undefined {
  const away = [...profile.trips]
    .filter((t) => normalizeCode(t.destination) !== home)
    .sort(
      (a, b) =>
        new Date(b.departedAt).getTime() - new Date(a.departedAt).getTime(),
    )[0];
  return away ? new Date(away.departedAt) : undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
