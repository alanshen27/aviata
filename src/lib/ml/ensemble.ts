import {
  FEATURE_NAMES,
  type FeatureVector,
  featuresToArray,
} from "../features";

export interface ModelScores {
  xgb: number;
  lstm: number;
  heuristic: number;
  ensemble: number;
  backend: "python" | "builtin";
}

/**
 * Builtin stand-in for the trained XGBoost model.
 * Coefficients mirror the synthetic trainer priors so the product
 * works without Python; production should call `ml/infer.py`.
 */
const XGB_WEIGHTS: Record<(typeof FEATURE_NAMES)[number], number> = {
  distance_nm: 0.0008,
  ground_time_hours: -0.01,
  origin_private_score: 1.4,
  dest_private_score: 1.3,
  fbo_pair_score: 1.8,
  is_asymmetric: 1.6,
  is_return_corridor: -2.2,
  short_turnaround: 1.1,
  idle_then_ferry: 0.9,
  one_way_ratio_7d: 1.2,
  legs_last_48h: 0.15,
  hour_of_day_utc: 0.01,
  dow: 0.02,
  aircraft_class_ord: 0.08,
  typical_seats: 0.01,
  same_country: 0.2,
  prior_leg_distance_nm: 0.0004,
  heading_delta_deg: 0.002,
};

const XGB_BIAS = -3.2;

/** Sequence summary scorer standing in for the LSTM head. */
export function scoreLstmBuiltin(features: FeatureVector): number {
  const sequenceCue =
    features.is_asymmetric * 0.45 +
    features.one_way_ratio_7d * 0.35 +
    (features.heading_delta_deg > 90 ? 0.15 : 0) +
    features.idle_then_ferry * 0.2 +
    features.short_turnaround * 0.15 -
    features.is_return_corridor * 0.55;

  return sigmoid(sequenceCue * 2.4 - 0.4);
}

export function scoreXgbBuiltin(features: FeatureVector): number {
  let z = XGB_BIAS;
  for (const name of FEATURE_NAMES) {
    z += XGB_WEIGHTS[name] * features[name];
  }
  return sigmoid(z);
}

export function scoreHeuristic(features: FeatureVector): number {
  let score = 0.15;
  if (features.is_asymmetric) score += 0.22;
  if (features.short_turnaround) score += 0.12;
  if (features.idle_then_ferry) score += 0.1;
  if (features.fbo_pair_score >= 0.9) score += 0.14;
  else if (features.fbo_pair_score >= 0.8) score += 0.08;
  if (features.one_way_ratio_7d >= 0.6) score += 0.12;
  if (features.is_return_corridor) score -= 0.35;
  if (features.distance_nm < 80 || features.distance_nm > 3500) score -= 0.15;
  if (features.ground_time_hours > 0 && features.ground_time_hours < 1.5)
    score -= 0.1;
  return clamp(score, 0.02, 0.98);
}

export function scoreEnsembleBuiltin(features: FeatureVector): ModelScores {
  const xgb = scoreXgbBuiltin(features);
  const lstm = scoreLstmBuiltin(features);
  const heuristic = scoreHeuristic(features);
  const ensemble = clamp(0.45 * xgb + 0.35 * lstm + 0.2 * heuristic, 0.01, 0.99);
  return { xgb, lstm, heuristic, ensemble, backend: "builtin" };
}

export async function scoreWithPython(
  features: FeatureVector,
  sequence?: number[][],
): Promise<ModelScores | null> {
  try {
    const { spawn } = await import("node:child_process");
    const path = await import("node:path");
    const script = path.join(process.cwd(), "ml", "infer.py");

    const payload = JSON.stringify({
      features: featuresToArray(features),
      feature_names: [...FEATURE_NAMES],
      sequence: sequence ?? null,
    });

    const result = await new Promise<string | null>((resolve) => {
      const child = spawn("python3", [script], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 8000);
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          if (stderr) console.warn("[ml] infer stderr:", stderr.slice(0, 400));
          resolve(null);
          return;
        }
        resolve(stdout);
      });
      child.stdin.write(payload);
      child.stdin.end();
    });

    if (!result) return null;
    const parsed = JSON.parse(result) as {
      xgb: number;
      lstm: number;
      heuristic: number;
      ensemble: number;
    };
    return { ...parsed, backend: "python" };
  } catch {
    return null;
  }
}

export async function scoreFeatures(
  features: FeatureVector,
  sequence?: number[][],
  opts?: { preferPython?: boolean },
): Promise<ModelScores> {
  const preferPython =
    opts?.preferPython === true ||
    process.env.REPOSITION_USE_PYTHON_ML === "1";

  if (preferPython) {
    const py = await scoreWithPython(features, sequence);
    if (py) return py;
  }
  return scoreEnsembleBuiltin(features);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
