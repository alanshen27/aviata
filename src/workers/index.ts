import { Worker } from "bullmq";
import { connectionOptions, getRedisUrl } from "@/lib/queue/connection";
import { processJob } from "@/lib/queue/processors";
import { QUEUE_NAME } from "@/lib/queue/types";

async function main() {
  console.log(`[worker] connecting to ${getRedisUrl()}`);
  console.log(`[worker] queue=${QUEUE_NAME}`);

  const worker = new Worker(QUEUE_NAME, async (job) => processJob(job as never), {
    ...connectionOptions(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  });

  worker.on("ready", () => console.log("[worker] ready"));
  worker.on("active", (job) =>
    console.log(`[worker] active ${job.id} ${job.name}`),
  );
  worker.on("completed", (job) =>
    console.log(`[worker] completed ${job.id} ${job.name}`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[worker] failed ${job?.id} ${job?.name}:`, err.message),
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal}, closing…`);
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
