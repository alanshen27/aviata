import type { Job } from "bullmq";
import { findAirport } from "@/lib/airports";
import { collectOpenSkySample } from "@/lib/collector";
import { detectEmptyLeg } from "@/lib/detector";
import { recommendFlights, predictReturn } from "@/lib/recommend/engine";
import { getDemoTraveler } from "@/lib/recommend/demoTravelers";
import { getLegs } from "@/lib/store";
import { parseLastJsonObject, runPython } from "./runPython";
import type {
  CollectOpenSkyData,
  IngestBuildData,
  IngestDownloadData,
  IngestFullData,
  JobName,
  MlTrainData,
  RecommendTravelerData,
  ScoreLegData,
} from "./types";

type AnyJob = Job<Record<string, unknown>, unknown, JobName>;

export async function processJob(job: AnyJob): Promise<unknown> {
  switch (job.name) {
    case "ingest:download":
      return processIngestDownload(job as Job<IngestDownloadData>);
    case "ingest:build":
      return processIngestBuild(job as Job<IngestBuildData>);
    case "ingest:full":
      return processIngestFull(job as Job<IngestFullData>);
    case "score:leg":
      return processScoreLeg(job as Job<ScoreLegData>);
    case "recommend:traveler":
      return processRecommend(job as Job<RecommendTravelerData>);
    case "collect:opensky":
      return processCollect(job as Job<CollectOpenSkyData>);
    case "ml:train":
      return processMlTrain(job as Job<MlTrainData>);
    default:
      throw new Error(`Unknown job: ${job.name}`);
  }
}

async function processIngestDownload(job: Job<IngestDownloadData>) {
  await job.updateProgress(5);
  const args = ["ml/ingest/download.py"];
  if (job.data.only?.length) {
    args.push("--only", ...job.data.only);
  }
  if (job.data.skipLive) args.push("--skip-live");

  const result = await runPython(args, { timeoutMs: 5 * 60_000 });
  await job.updateProgress(100);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "download failed");
  }
  return {
    ok: true,
    summary: parseLastJsonObject(result.stdout),
    stderrTail: result.stderr.slice(-500),
  };
}

async function processIngestBuild(job: Job<IngestBuildData>) {
  await job.updateProgress(10);
  const args = ["ml/ingest/build_training.py"];
  if (job.data.limit) args.push("--limit", String(job.data.limit));
  const result = await runPython(args, { timeoutMs: 10 * 60_000 });
  await job.updateProgress(100);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "build failed");
  }
  return {
    ok: true,
    summary: parseLastJsonObject(result.stdout),
  };
}

async function processIngestFull(job: Job<IngestFullData>) {
  await job.updateProgress(5);
  const dlArgs = ["ml/ingest/download.py"];
  if (job.data.only?.length) dlArgs.push("--only", ...job.data.only);
  if (job.data.skipLive) dlArgs.push("--skip-live");
  const dl = await runPython(dlArgs, { timeoutMs: 5 * 60_000 });
  if (dl.code !== 0) {
    throw new Error(dl.stderr || dl.stdout || "download failed");
  }
  await job.updateProgress(55);

  const buildArgs = ["ml/ingest/build_training.py"];
  if (job.data.limit) buildArgs.push("--limit", String(job.data.limit));
  const build = await runPython(buildArgs, { timeoutMs: 10 * 60_000 });
  if (build.code !== 0) {
    throw new Error(build.stderr || build.stdout || "build failed");
  }
  await job.updateProgress(100);
  return {
    ok: true,
    download: parseLastJsonObject(dl.stdout),
    build: parseLastJsonObject(build.stdout),
  };
}

async function processScoreLeg(job: Job<ScoreLegData>) {
  const d = job.data;
  const origin = findAirport(d.origin);
  const destination = findAirport(d.destination);
  if (!origin || !destination) {
    throw new Error("origin/destination airport not found");
  }
  await job.updateProgress(20);
  const result = await detectEmptyLeg({
    icao24: d.icao24,
    registration: d.registration,
    typecode: d.typecode,
    origin,
    destination,
    estimatedDeparture: new Date(Date.now() + 4 * 3600_000),
    groundTimeHours: d.groundTimeHours ?? 4,
    priorOrigin: d.priorOrigin ? findAirport(d.priorOrigin) : undefined,
    priorDestination: d.priorDestination
      ? findAirport(d.priorDestination)
      : undefined,
    oneWayRatio7d: d.oneWayRatio7d ?? 0.6,
    legsLast48h: d.legsLast48h ?? 2,
    preferPython: d.preferPython === true,
    minConfidence: 0,
  });
  await job.updateProgress(100);
  return {
    features: result.features,
    scores: result.scores,
    candidate: result.candidate,
  };
}

async function processRecommend(job: Job<RecommendTravelerData>) {
  await job.updateProgress(15);
  const profile = getDemoTraveler(job.data.traveler);
  const legs = await getLegs();
  const recommendations = await recommendFlights(
    profile,
    legs,
    new Date(),
    { preferPython: job.data.preferPython === true },
  );
  const prediction =
    recommendations[0]?.prediction ??
    (await predictReturn(profile, new Date(), {
      preferPython: job.data.preferPython === true,
    }));
  await job.updateProgress(100);
  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      homeAirport: profile.homeAirport,
      currentAirport: profile.currentAirport,
    },
    prediction,
    recommendations: recommendations.slice(0, 10),
  };
}

async function processCollect(_job: Job<CollectOpenSkyData>) {
  const sample = await collectOpenSkySample();
  return sample;
}

async function processMlTrain(job: Job<MlTrainData>) {
  await job.updateProgress(5);
  const args = ["ml/train_all.py"];
  if (job.data.fromOpenData !== false) args.push("--from-open-data");
  if (job.data.mixSynthetic != null) {
    args.push("--mix-synthetic", String(job.data.mixSynthetic));
  }
  const result = await runPython(args, { timeoutMs: 20 * 60_000 });
  await job.updateProgress(100);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "train failed");
  }
  return {
    ok: true,
    summary: parseLastJsonObject(result.stdout),
  };
}
