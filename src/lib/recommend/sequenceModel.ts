import type { TravelerProfile } from "../types";
import { normalizeCode } from "./patterns";

export interface ReturnIntentScore {
  returnProbability: number;
  backend: "transformer" | "lstm" | "builtin";
}

/**
 * Sequence model over past trips.
 * Prefers trained Transformer via Python; falls back to stay-window logistic.
 */
export async function scoreReturnIntent(
  profile: TravelerProfile,
  ctx: {
    daysAway: number;
    predictedStayDays: number;
    home: string;
    current: string;
  },
  opts?: { preferPython?: boolean },
): Promise<ReturnIntentScore> {
  const preferPython =
    opts?.preferPython === true ||
    process.env.REPOSITION_USE_PYTHON_ML === "1";
  if (preferPython) {
    const py = await scoreWithPython(profile, ctx);
    if (py) return py;
  }
  return scoreBuiltin(ctx);
}

export function scoreBuiltin(ctx: {
  daysAway: number;
  predictedStayDays: number;
  home: string;
  current: string;
}): ReturnIntentScore {
  if (ctx.current === ctx.home || ctx.daysAway <= 0) {
    return { returnProbability: 0.08, backend: "builtin" };
  }

  // Logistic peak around typical stay length (e.g. 7 days SGP→China→home).
  const delta = ctx.daysAway - ctx.predictedStayDays;
  const z = 1.6 - Math.abs(delta) * 0.55 + Math.min(ctx.daysAway, 14) * 0.08;
  const midTripPenalty = delta < -3 ? -0.8 : 0;
  const overdueBoost = delta > 0 ? Math.min(1.2, delta * 0.35) : 0;
  const p = sigmoid(z + midTripPenalty + overdueBoost);
  return { returnProbability: clamp(p, 0.02, 0.98), backend: "builtin" };
}

async function scoreWithPython(
  profile: TravelerProfile,
  ctx: {
    daysAway: number;
    predictedStayDays: number;
    home: string;
    current: string;
  },
): Promise<ReturnIntentScore | null> {
  try {
    const { spawn } = await import("node:child_process");
    const path = await import("node:path");
    const script = path.join(process.cwd(), "ml", "infer_recommend.py");

    const trips = [...profile.trips]
      .sort(
        (a, b) =>
          new Date(a.departedAt).getTime() - new Date(b.departedAt).getTime(),
      )
      .map((t) => ({
        origin: normalizeCode(t.origin),
        destination: normalizeCode(t.destination),
        stay_days: t.stayDays ?? null,
        departed_at: t.departedAt,
      }));

    const payload = JSON.stringify({
      task: "recommend",
      home: ctx.home,
      current: ctx.current,
      days_away: ctx.daysAway,
      predicted_stay_days: ctx.predictedStayDays,
      trips,
    });

    const result = await new Promise<string | null>((resolve) => {
      const child = spawn("python3", [script], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 10000);
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? stdout : null);
      });
      child.stdin.write(payload);
      child.stdin.end();
    });

    if (!result) return null;
    const parsed = JSON.parse(result) as {
      return_probability: number;
      backend?: "transformer" | "lstm" | "builtin";
    };
    return {
      returnProbability: clamp(parsed.return_probability, 0.02, 0.98),
      backend: parsed.backend ?? "transformer",
    };
  } catch {
    return null;
  }
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
