import { describe, expect, it } from "vitest";
import { getDemoTraveler } from "./demoTravelers";
import { recommendFlights, predictReturn } from "./engine";
import { inferStayStats, daysAwayNow } from "./patterns";
import { scoreBuiltin } from "./sequenceModel";
import type { EmptyLegCandidate } from "../types";
import { AIRPORTS } from "../airports";
import { PRIVATE_JET_TYPES } from "../aircraft";

describe("traveler stay patterns", () => {
  it("learns ~7 day Singapore–China stays", () => {
    const profile = getDemoTraveler("trav_sgp_china");
    const stats = inferStayStats(profile);
    expect(stats.medianStayDays).toBeGreaterThanOrEqual(6);
    expect(stats.medianStayDays).toBeLessThanOrEqual(8);
    expect(stats.commonDestinations).toContain("PVG");
  });

  it("opens return intent near the end of a China trip", async () => {
    const profile = getDemoTraveler("trav_sgp_china");
    expect(daysAwayNow(profile)).toBeGreaterThan(5);

    const early = scoreBuiltin({
      daysAway: 2,
      predictedStayDays: 7,
      home: "SIN",
      current: "PVG",
    });
    const window = scoreBuiltin({
      daysAway: 7.2,
      predictedStayDays: 7,
      home: "SIN",
      current: "PVG",
    });
    expect(window.returnProbability).toBeGreaterThan(early.returnProbability);

    const prediction = await predictReturn(profile);
    expect(prediction.homeAirport).toBe("SIN");
    expect(prediction.currentAirport).toBe("PVG");
    expect(prediction.returnProbability).toBeGreaterThan(0.4);
  });

  it("ranks PVG→SIN empty legs for the Singapore traveler", async () => {
    const profile = getDemoTraveler("trav_sgp_china");
    const leg: EmptyLegCandidate = {
      id: "leg_test_pvg_sin",
      icao24: "7504a1",
      registration: "9V-SGD",
      aircraftType: PRIVATE_JET_TYPES.GLEX,
      origin: AIRPORTS.PVG,
      destination: AIRPORTS.SIN,
      estimatedDeparture: new Date().toISOString(),
      estimatedArrival: new Date(Date.now() + 5 * 3600_000).toISOString(),
      distanceNm: 2000,
      confidence: 0.8,
      signals: ["asymmetric_route", "fbo_pair"],
      status: "predicted",
      estimatedPriceUsd: 12000,
      fullCharterUsd: 28000,
      discountPct: 57,
      source: "demo",
      detectedAt: new Date().toISOString(),
    };

    const recs = await recommendFlights(profile, [leg]);
    expect(recs.length).toBe(1);
    expect(recs[0].kind).toBe("return_home");
    expect(recs[0].score).toBeGreaterThan(0.5);
  });
});
