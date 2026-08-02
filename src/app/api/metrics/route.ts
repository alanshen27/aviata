import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readJson(rel: string) {
  try {
    // path is relative to the app root (reposition/)
    const full = path.join(/* turbopackIgnore: true */ process.cwd(), rel);
    const text = await fs.readFile(full, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET() {
  const metrics = await readJson("ml/metrics/reports/detection_metrics.json");
  const listings = await readJson("ml/data/processed/listings_summary.json");

  if (!metrics) {
    return NextResponse.json(
      {
        error: "No metrics report yet",
        hint: "npm run data:listings && npm run metrics:detection",
      },
      { status: 404 },
    );
  }

  const ensemble = metrics.heads?.builtin_ensemble;
  const trained = metrics.heads?.trained_xgb;

  return NextResponse.json({
    deterministic: metrics.deterministic,
    split: metrics.split,
    fixtures: metrics.fixtures,
    holdout: {
      heuristic_auc: metrics.heads?.heuristic?.auc,
      builtin_ensemble_auc: ensemble?.auc,
      builtin_ensemble_best_f1: ensemble?.best_f1,
      trained_xgb_auc: trained?.auc,
      trained_xgb_best_f1: trained?.best_f1,
    },
    listing_anchored: metrics.listing_anchored,
    production_guidance: metrics.production_guidance,
    listings_ingest: listings,
    where_listed: "ml/data/LISTINGS.md",
    full_report_path: "ml/metrics/reports/detection_metrics.json",
  });
}
