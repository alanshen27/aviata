import { describe, expect, it } from "vitest";
import { AIRPORTS } from "./airports";
import { extractFeatures, signalsFromFeatures } from "./features";

describe("extractFeatures", () => {
  it("flags asymmetric short-turnaround ferry cues", () => {
    const features = extractFeatures({
      origin: AIRPORTS.TEB,
      destination: AIRPORTS.OPF,
      groundTimeHours: 3.5,
      estimatedDeparture: new Date("2026-08-02T15:00:00Z"),
      aircraftClass: "midsize",
      typicalSeats: 9,
      priorOrigin: AIRPORTS.ASE,
      priorDestination: AIRPORTS.TEB,
      priorDistanceNm: 1800,
      oneWayRatio7d: 0.7,
      legsLast48h: 2,
    });

    expect(features.is_asymmetric).toBe(1);
    expect(features.is_return_corridor).toBe(0);
    expect(features.short_turnaround).toBe(1);
    expect(features.fbo_pair_score).toBeGreaterThan(0.9);
    expect(signalsFromFeatures(features)).toContain("asymmetric_route");
  });

  it("down-ranks pure return corridors", () => {
    const features = extractFeatures({
      origin: AIRPORTS.VNY,
      destination: AIRPORTS.LAS,
      groundTimeHours: 20,
      estimatedDeparture: new Date("2026-08-02T18:00:00Z"),
      aircraftClass: "ultra_long_range",
      typicalSeats: 18,
      priorOrigin: AIRPORTS.LAS,
      priorDestination: AIRPORTS.VNY,
      oneWayRatio7d: 0.3,
    });

    expect(features.is_return_corridor).toBe(1);
    expect(features.is_asymmetric).toBe(0);
  });
});
