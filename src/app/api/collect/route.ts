import { NextResponse } from "next/server";
import { collectOpenSkySample } from "@/lib/collector";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sample = await collectOpenSkySample();
    return NextResponse.json(sample);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Collect failed",
        licenseNote:
          "OpenSky commercial/operational use requires a written license.",
      },
      { status: 502 },
    );
  }
}
