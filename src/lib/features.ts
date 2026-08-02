import { haversineNm } from "./airports";
import type { AircraftClass, Airport, EmptyLegSignal } from "./types";

export const FEATURE_NAMES = [
  "distance_nm",
  "ground_time_hours",
  "origin_private_score",
  "dest_private_score",
  "fbo_pair_score",
  "is_asymmetric",
  "is_return_corridor",
  "short_turnaround",
  "idle_then_ferry",
  "one_way_ratio_7d",
  "legs_last_48h",
  "hour_of_day_utc",
  "dow",
  "aircraft_class_ord",
  "typical_seats",
  "same_country",
  "prior_leg_distance_nm",
  "heading_delta_deg",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

const CLASS_ORD: Record<AircraftClass, number> = {
  very_light: 0,
  light: 1,
  midsize: 2,
  super_midsize: 3,
  heavy: 4,
  ultra_long_range: 5,
};

export interface LegContext {
  origin: Airport;
  destination: Airport;
  groundTimeHours: number;
  estimatedDeparture: Date;
  aircraftClass: AircraftClass;
  typicalSeats: number;
  /** Prior leg for this tail, if known */
  priorOrigin?: Airport;
  priorDestination?: Airport;
  priorDistanceNm?: number;
  /** Share of one-way (non-return) legs in last 7 days for this tail */
  oneWayRatio7d?: number;
  legsLast48h?: number;
}

export function extractFeatures(ctx: LegContext): FeatureVector {
  const distanceNm = haversineNm(
    ctx.origin.lat,
    ctx.origin.lon,
    ctx.destination.lat,
    ctx.destination.lon,
  );

  /** Current departure airport matches prior landing — continuous tail track. */
  const continuesFromPrior =
    !!ctx.priorDestination &&
    ctx.priorDestination.icao === ctx.origin.icao;

  /** Exact reverse of the prior leg (A→B then B→A). */
  const isReturn =
    continuesFromPrior &&
    !!ctx.priorOrigin &&
    ctx.priorOrigin.icao === ctx.destination.icao;

  /** Continues onward to a third airport (A→B then B→C) — strong ferry cue. */
  const isAsymmetric = continuesFromPrior && !isReturn;

  const shortTurnaround = ctx.groundTimeHours > 0 && ctx.groundTimeHours <= 6;
  const idleThenFerry = ctx.groundTimeHours >= 18 && ctx.groundTimeHours <= 72;

  let headingDelta = 0;
  if (ctx.priorOrigin && ctx.priorDestination) {
    const prev = bearingDeg(
      ctx.priorOrigin.lat,
      ctx.priorOrigin.lon,
      ctx.priorDestination.lat,
      ctx.priorDestination.lon,
    );
    const next = bearingDeg(
      ctx.origin.lat,
      ctx.origin.lon,
      ctx.destination.lat,
      ctx.destination.lon,
    );
    headingDelta = angularDelta(prev, next);
  }

  return {
    distance_nm: round(distanceNm, 1),
    ground_time_hours: round(ctx.groundTimeHours, 2),
    origin_private_score: ctx.origin.privateTrafficScore,
    dest_private_score: ctx.destination.privateTrafficScore,
    fbo_pair_score: round(
      (ctx.origin.privateTrafficScore + ctx.destination.privateTrafficScore) /
        2,
      3,
    ),
    is_asymmetric: isAsymmetric ? 1 : 0,
    is_return_corridor: isReturn ? 1 : 0,
    short_turnaround: shortTurnaround ? 1 : 0,
    idle_then_ferry: idleThenFerry ? 1 : 0,
    one_way_ratio_7d: ctx.oneWayRatio7d ?? 0.5,
    legs_last_48h: ctx.legsLast48h ?? 1,
    hour_of_day_utc: ctx.estimatedDeparture.getUTCHours(),
    dow: ctx.estimatedDeparture.getUTCDay(),
    aircraft_class_ord: CLASS_ORD[ctx.aircraftClass],
    typical_seats: ctx.typicalSeats,
    same_country: ctx.origin.country === ctx.destination.country ? 1 : 0,
    prior_leg_distance_nm: round(ctx.priorDistanceNm ?? 0, 1),
    heading_delta_deg: round(headingDelta, 1),
  };
}

export function featuresToArray(features: FeatureVector): number[] {
  return FEATURE_NAMES.map((name) => features[name]);
}

export function signalsFromFeatures(features: FeatureVector): EmptyLegSignal[] {
  const signals: EmptyLegSignal[] = [];
  if (features.is_asymmetric) signals.push("asymmetric_route");
  if (features.short_turnaround) signals.push("short_turnaround");
  if (features.idle_then_ferry) signals.push("idle_then_ferry");
  if (features.one_way_ratio_7d >= 0.55) signals.push("one_way_pattern");
  if (features.fbo_pair_score >= 0.88) signals.push("fbo_pair");
  if (
    features.is_asymmetric &&
    features.origin_private_score >= 0.85 &&
    features.dest_private_score >= 0.85
  ) {
    signals.push("reposition_corridor");
  }
  return signals;
}

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angularDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
