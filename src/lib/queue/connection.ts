import IORedis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __repositionRedis: IORedis | undefined;
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

/** Shared ioredis connection for BullMQ (maxRetriesPerRequest: null required). */
export function getQueueConnection(): IORedis {
  if (!globalThis.__repositionRedis) {
    globalThis.__repositionRedis = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return globalThis.__repositionRedis;
}

export function connectionOptions() {
  return {
    connection: getQueueConnection(),
  };
}
