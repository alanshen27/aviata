import { describe, expect, it } from "vitest";
import {
  scoreEnsembleBuiltin,
  scoreHeuristic,
  scoreLstmBuiltin,
  scoreXgbBuiltin,
} from "./ensemble";
import type { FeatureVector } from "../features";
import { FEATURE_NAMES } from "../features";

/** Must stay aligned with ml/metrics/evaluate_detection.py fixtures. */
const ASYMMETRIC_FBO_FERRY: FeatureVector = {
  distance_nm: 950,
  ground_time_hours: 3.5,
  origin_private_score: 0.98,
  dest_private_score: 0.93,
  fbo_pair_score: 0.955,
  is_asymmetric: 1,
  is_return_corridor: 0,
  short_turnaround: 1,
  idle_then_ferry: 0,
  one_way_ratio_7d: 0.71,
  legs_last_48h: 2,
  hour_of_day_utc: 15,
  dow: 2,
  aircraft_class_ord: 2,
  typical_seats: 9,
  same_country: 1,
  prior_leg_distance_nm: 1500,
  heading_delta_deg: 125,
};

const EXACT_RETURN: FeatureVector = {
  ...ASYMMETRIC_FBO_FERRY,
  is_asymmetric: 0,
  is_return_corridor: 1,
  one_way_ratio_7d: 0.3,
  prior_leg_distance_nm: 950,
  heading_delta_deg: 180,
};

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

describe("deterministic detector fixtures", () => {
  it("keeps feature name order length 18", () => {
    expect(FEATURE_NAMES).toHaveLength(18);
  });

  it("scores asymmetric ferry above exact return (ensemble)", () => {
    const ferry = scoreEnsembleBuiltin(ASYMMETRIC_FBO_FERRY);
    const ret = scoreEnsembleBuiltin(EXACT_RETURN);
    expect(ferry.ensemble).toBeGreaterThan(ret.ensemble);
    expect(ferry.ensemble).toBeGreaterThan(0.85);
    expect(ret.ensemble).toBeLessThan(ferry.ensemble);
  });

  it("emits stable rounded scores for CI golden checks", () => {
    const ferry = {
      heuristic: round6(scoreHeuristic(ASYMMETRIC_FBO_FERRY)),
      builtin_xgb: round6(scoreXgbBuiltin(ASYMMETRIC_FBO_FERRY)),
      builtin_lstm: round6(scoreLstmBuiltin(ASYMMETRIC_FBO_FERRY)),
      ensemble: round6(scoreEnsembleBuiltin(ASYMMETRIC_FBO_FERRY).ensemble),
    };
    const ret = {
      heuristic: round6(scoreHeuristic(EXACT_RETURN)),
      builtin_xgb: round6(scoreXgbBuiltin(EXACT_RETURN)),
      builtin_lstm: round6(scoreLstmBuiltin(EXACT_RETURN)),
      ensemble: round6(scoreEnsembleBuiltin(EXACT_RETURN).ensemble),
    };

    // Locked values — must match ml/metrics/evaluate_detection.py fixtures.
    expect(ferry).toEqual({
      heuristic: 0.75,
      builtin_xgb: 0.999229,
      builtin_lstm: 0.880419,
      ensemble: 0.9078,
    });
    expect(ret).toEqual({
      heuristic: 0.06,
      builtin_xgb: 0.940755,
      builtin_lstm: 0.321257,
      ensemble: 0.54778,
    });
  });
});
