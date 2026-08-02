import { Queue, type JobsOptions } from "bullmq";
import { connectionOptions } from "./connection";
import {
  QUEUE_NAME,
  type JobDataMap,
  type JobName,
} from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __repositionQueue: Queue | undefined;
}

export function getQueue(): Queue {
  if (!globalThis.__repositionQueue) {
    globalThis.__repositionQueue = new Queue(QUEUE_NAME, {
      ...connectionOptions(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return globalThis.__repositionQueue;
}

export async function enqueueJob<N extends JobName>(
  name: N,
  data: JobDataMap[N] = {} as JobDataMap[N],
  opts: JobsOptions = {},
) {
  const queue = getQueue();
  const job = await queue.add(name, data, opts);
  return {
    id: job.id,
    name: job.name,
    queue: QUEUE_NAME,
    data: job.data,
  };
}

export async function getJobStatus(id: string) {
  const queue = getQueue();
  const job = await queue.getJob(id);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

export async function listRecentJobs(limit = 30) {
  const queue = getQueue();
  const jobs = await queue.getJobs(
    ["active", "waiting", "delayed", "completed", "failed"],
    0,
    limit - 1,
    true,
  );

  return Promise.all(
    jobs.map(async (job) => ({
      id: job.id,
      name: job.name,
      state: await job.getState(),
      progress: job.progress,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
    })),
  );
}
