import { NextResponse } from "next/server";
import { getJobStatus } from "@/lib/queue/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const job = await getJobStatus(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "queue unavailable",
      },
      { status: 503 },
    );
  }
}
