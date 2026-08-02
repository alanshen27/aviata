import { NextResponse } from "next/server";
import { enqueueJob, listRecentJobs } from "@/lib/queue/queues";
import type { JobEnqueueRequest, JobName } from "@/lib/queue/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JOB_NAMES: JobName[] = [
  "ingest:download",
  "ingest:build",
  "ingest:full",
  "score:leg",
  "recommend:traveler",
  "collect:opensky",
  "ml:train",
];

export async function GET() {
  try {
    const jobs = await listRecentJobs(40);
    return NextResponse.json({
      queue: "reposition",
      redis: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      jobs,
      jobNames: JOB_NAMES,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "queue unavailable",
        hint: "Start Redis and npm run worker",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as JobEnqueueRequest;
    if (!body.name || !JOB_NAMES.includes(body.name)) {
      return NextResponse.json(
        { error: "Invalid job name", jobNames: JOB_NAMES },
        { status: 400 },
      );
    }

    const enqueued = await enqueueJob(body.name, body.data ?? {}, {
      delay: body.delay,
      attempts: body.attempts,
    });

    return NextResponse.json({ ok: true, job: enqueued }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "enqueue failed",
        hint: "Is Redis running? REDIS_URL=" + (process.env.REDIS_URL ?? "default"),
      },
      { status: 503 },
    );
  }
}
