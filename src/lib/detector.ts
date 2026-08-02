import { getAircraftType } from "./aircraft";
import { haversineNm } from "./airports";
import {
  extractFeatures,
  featuresToArray,
  signalsFromFeatures,
  type LegContext,
} from "./features";
import { scoreFeatures, type ModelScores } from "./ml/ensemble";
import {
  estimateEmptyLegPriceUsd,
  estimateFullCharterUsd,
} from "./pricing";
import type { Airport, DataSource, EmptyLegCandidate } from "./types";

export interface DetectInput {
  icao24: string;
  registration: string;
  callsign?: string;
  typecode: string;
  origin: Airport;
  destination: Airport;
  estimatedDeparture: Date;
  estimatedArrival?: Date;
  groundTimeHours: number;
  priorOrigin?: Airport;
  priorDestination?: Airport;
  oneWayRatio7d?: number;
  legsLast48h?: number;
  /** Optional LSTM sequence: up to N prior legs × feature dims */
  sequence?: number[][];
  source?: DataSource;
  notes?: string;
  minConfidence?: number;
  /** Use trained XGBoost/LSTM via Python (slower; loads models per call). */
  preferPython?: boolean;
}

export interface DetectionResult {
  candidate: EmptyLegCandidate | null;
  features: ReturnType<typeof extractFeatures>;
  scores: ModelScores;
}

export async function detectEmptyLeg(
  input: DetectInput,
): Promise<DetectionResult> {
  const aircraftType = getAircraftType(input.typecode);
  if (!aircraftType) {
    throw new Error(`Unsupported typecode: ${input.typecode}`);
  }

  const priorDistanceNm =
    input.priorOrigin && input.priorDestination
      ? haversineNm(
          input.priorOrigin.lat,
          input.priorOrigin.lon,
          input.priorDestination.lat,
          input.priorDestination.lon,
        )
      : undefined;

  const ctx: LegContext = {
    origin: input.origin,
    destination: input.destination,
    groundTimeHours: input.groundTimeHours,
    estimatedDeparture: input.estimatedDeparture,
    aircraftClass: aircraftType.aircraftClass,
    typicalSeats: aircraftType.typicalSeats,
    priorOrigin: input.priorOrigin,
    priorDestination: input.priorDestination,
    priorDistanceNm,
    oneWayRatio7d: input.oneWayRatio7d,
    legsLast48h: input.legsLast48h,
  };

  const features = extractFeatures(ctx);
  const sequence =
    input.sequence ??
    buildDefaultSequence(featuresToArray(features), input.oneWayRatio7d ?? 0.5);

  const scores = await scoreFeatures(features, sequence, {
    preferPython: input.preferPython,
  });
  const confidence = scores.ensemble;
  const minConfidence = input.minConfidence ?? 0.42;
  const signals = signalsFromFeatures(features);

  const distanceNm = features.distance_nm;
  const cruiseKnots =
    aircraftType.aircraftClass === "ultra_long_range" ||
    aircraftType.aircraftClass === "heavy"
      ? 460
      : 420;
  const flightHours = Math.max(0.6, distanceNm / cruiseKnots + 0.35);
  const eta =
    input.estimatedArrival ??
    new Date(input.estimatedDeparture.getTime() + flightHours * 3600_000);

  const fullCharterUsd = estimateFullCharterUsd(
    distanceNm,
    aircraftType.aircraftClass,
  );
  const { price, discountPct } = estimateEmptyLegPriceUsd(
    fullCharterUsd,
    confidence,
  );

  if (confidence < minConfidence || signals.length === 0) {
    return { candidate: null, features, scores };
  }

  const candidate: EmptyLegCandidate = {
    id: `leg_${input.icao24}_${input.estimatedDeparture.toISOString()}`,
    icao24: input.icao24,
    registration: input.registration,
    callsign: input.callsign,
    aircraftType,
    origin: input.origin,
    destination: input.destination,
    estimatedDeparture: input.estimatedDeparture.toISOString(),
    estimatedArrival: eta.toISOString(),
    distanceNm,
    confidence: round(confidence, 3),
    signals,
    status: "predicted",
    estimatedPriceUsd: price,
    fullCharterUsd,
    discountPct,
    source: input.source ?? "demo",
    detectedAt: new Date().toISOString(),
    notes:
      input.notes ??
      `Ensemble ${scores.backend}: xgb=${pct(scores.xgb)} lstm=${pct(scores.lstm)} heur=${pct(scores.heuristic)}`,
  };

  return { candidate, features, scores };
}

function buildDefaultSequence(
  current: number[],
  oneWayRatio: number,
): number[][] {
  // Synthetic prior timesteps so LSTM path has a short history.
  const seq: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const scale = 0.85 + i * 0.05;
    seq.push(
      current.map((v, idx) => {
        if (idx === 9) return clamp(oneWayRatio * scale, 0, 1); // one_way_ratio_7d
        if (idx === 5) return i === 2 ? 1 : 0; // is_asymmetric peaks at latest
        return v * (0.9 + Math.random() * 0.1);
      }),
    );
  }
  seq.push(current);
  return seq;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function round(n: number, d: number): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
