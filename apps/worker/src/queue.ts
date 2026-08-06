import { Queue, Worker, type ConnectionOptions } from "bullmq";

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
};

export const SYNC_QUEUE_NAME = "sync";
export const RECOMMENDATION_QUEUE_NAME = "recommendations";

export function createQueue(name: string) {
  return new Queue(name, { connection });
}

export function createWorker(name: string, processor: ConstructorParameters<typeof Worker>[1]) {
  return new Worker(name, processor, { connection });
}
