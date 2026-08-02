import { describe, expect, it } from "vitest";
import { AIRPORTS } from "./airports";
import { detectEmptyLeg } from "./detector";
import { scoreEnsembleBuiltin } from "./ml/ensemble";
import { extractFeatures } from "./features";

describe("detectEmptyLeg", () => {
  it("emits a high-confidence candidate for asymmetric FBO ferry", async () => {
    const { candidate, scores } = await detectEmptyLeg({
      icao24: "abcdef",
      registration: "N123EL",
      typecode: "CL35",
      origin: AIRPORTS.HPN,
      destination: AIRPORTS.PBI,
      estimatedDeparture: new Date(Date.now() + 4 * 3600_000),
      groundTimeHours: 4,
      priorOrigin: AIRPORTS.DAL,
      priorDestination: AIRPORTS.HPN,
      oneWayRatio7d: 0.68,
      legsLast48h: 2,
      minConfidence: 0.4,
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.confidence).toBeGreaterThan(0.5);
    expect(candidate!.estimatedPriceUsd).toBeLessThan(candidate!.fullCharterUsd);
    expect(scores.ensemble).toBeGreaterThan(scores.heuristic * 0.5);
  });

  it("builtin ensemble prefers asymmetric over return", () => {
    const asymmetric = extractFeatures({
      origin: AIRPORTS.TEB,
      destination: AIRPORTS.OPF,
      groundTimeHours: 3,
      estimatedDeparture: new Date(),
      aircraftClass: "midsize",
      typicalSeats: 8,
      priorOrigin: AIRPORTS.ASE,
      priorDestination: AIRPORTS.TEB,
      oneWayRatio7d: 0.7,
    });
    const returning = extractFeatures({
      origin: AIRPORTS.TEB,
      destination: AIRPORTS.OPF,
      groundTimeHours: 3,
      estimatedDeparture: new Date(),
      aircraftClass: "midsize",
      typicalSeats: 8,
      priorOrigin: AIRPORTS.OPF,
      priorDestination: AIRPORTS.TEB,
      oneWayRatio7d: 0.3,
    });

    expect(scoreEnsembleBuiltin(asymmetric).ensemble).toBeGreaterThan(
      scoreEnsembleBuiltin(returning).ensemble,
    );
  });
});
