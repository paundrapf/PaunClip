import "server-only";
import PQueue from "p-queue";
import { db } from "@/server/db/client";
import { createJobLogger, serializeError } from "@/server/logging/logger";
import { createJobInputSchema, type CreateJobInput, type JobType } from "@/shared/schemas/job";
import {
  completeJob,
  createJob,
  emitJobEvent,
  failJob,
  markJobRunning,
  updateJobProgress
} from "./job-store";

type JobHandler = (context: JobContext) => Promise<void>;

export type JobContext = {
  jobId: string;
  payload: Record<string, unknown>;
  sessionId?: string;
  progress: (progress: number, message: string, data?: Record<string, unknown>) => Promise<void>;
  log: (message: string, data?: Record<string, unknown>) => Promise<void>;
};

const queue = new PQueue({ concurrency: 1 });
const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(input: CreateJobInput) {
  const parsed = createJobInputSchema.parse(input);
  const job = await createJob(parsed);
  queue.add(() => runJob(job.id, parsed));
  return job;
}

export async function runJob(jobId: string, input: CreateJobInput) {
  const handler = handlers.get(input.type);
  if (!handler) {
    throw new Error(`No job handler registered for ${input.type}`);
  }
  const logger = createJobLogger({ jobId, sessionId: input.sessionId });

  await markJobRunning(jobId);
  await logger.info("Job started", { type: input.type });
  await emitJobEvent({
    jobId,
    type: "status",
    message: "Job started",
    data: { type: input.type }
  });

  const context: JobContext = {
    jobId,
    payload: input.payload,
    sessionId: input.sessionId,
    progress: async (progress, message, data) => {
      await updateJobProgress(jobId, progress);
      await emitJobEvent({
        jobId,
        type: "progress",
        message,
        data: { progress, ...data }
      });
    },
    log: async (message, data) => {
      await emitJobEvent({
        jobId,
        type: "log",
        message,
        data
      });
      await logger.info(message, data);
    }
  };

  try {
    await handler(context);
    await completeJob(jobId);
    await logger.info("Job completed", { progress: 100 });
    await emitJobEvent({
      jobId,
      type: "status",
      message: "Job completed",
      data: { progress: 100 }
    });
  } catch (error) {
    await failJob(jobId, error);
    if (input.sessionId) {
      await db.session.update({
        where: { id: input.sessionId },
        data: {
          status: "failed",
          stage: "failed"
        }
      });
    }
    await logger.error("Job failed", { error: serializeError(error) });
    await emitJobEvent({
      jobId,
      type: "error",
      message: error instanceof Error ? error.message : "Job failed",
      data: { error: serializeError(error) }
    });
  }
}

export function getQueueStats() {
  return {
    pending: queue.pending,
    size: queue.size,
    isPaused: queue.isPaused
  };
}
