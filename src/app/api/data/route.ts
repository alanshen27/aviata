import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

async function readJson(rel: string) {
  try {
    const full = path.join(process.cwd(), rel);
    const text = await fs.readFile(full, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET() {
  const manifest = await readJson("ml/data/raw/manifest.json");
  const build = await readJson("ml/data/processed/build_summary.json");
  const live = await readJson("ml/data/processed/adsblol_live_summary.json");
  const xgb = await readJson("ml/models/xgb_metrics.json");

  return NextResponse.json({
    sourcesDoc: "ml/data/SOURCES.md",
    commands: {
      download: "npm run data:download",
      build: "npm run data:build",
      trainOpen: "npm run ml:train:open",
    },
    manifest,
    build,
    live,
    xgb,
    notes: [
      "Open ADS-B sets do not include true empty-leg labels — training uses weak geometry labels.",
      "OpenSky / ADSBx commercial use needs a license before selling a product on top.",
      "ADSB.lol historical dumps are ODbL (share-alike).",
    ],
  });
}
