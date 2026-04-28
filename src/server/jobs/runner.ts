import "server-only";
import PQueue from "p-queue";
import { db } from "@/server/db/client";
import { createJobLogger, serializeError } from "@/server/logging/logger";
import {
  assertJobNotCancelled,
  clearJobCancellation,
  JobCancelledError,
  requestJobCancellation
} from "@/server/jobs/process-registry";
import { createJobInputSchema, type CreateJobInput, type JobType } from "@/shared/schemas/job";
import {
  cancelJobRecord,
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
const scheduledJobIds = new Set<string>();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(input: CreateJobInput) {
  const parsed = createJobInputSchema.parse(input);
  const job = await createJob(parsed);
  scheduleJob(job.id, parsed);
  return job;
}

export async function resumeQueuedJobs() {
  const jobs = await db.job.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: 25
  });
  let resumed = 0;

  for (const job of jobs) {
    if (scheduledJobIds.has(job.id)) {
      continue;
    }

    try {
      const input = createJobInputSchema.parse({
        type: job.type,
        sessionId: job.sessionId ?? undefined,
        payload: parseJobPayload(job.payloadJson)
      });
      scheduleJob(job.id, input);
      resumed += 1;
    } catch (error) {
      await failJob(job.id, error);
      await emitJobEvent({
        jobId: job.id,
        type: "error",
        message: "Queued job could not be resumed",
        data: { error: serializeError(error) }
      });
    }
  }

  return { resumed, queued: jobs.length };
}

export async function runJob(jobId: string, input: CreateJobInput) {
  const handler = handlers.get(input.type);
  if (!handler) {
    throw new Error(`No job handler registered for ${input.type}`);
  }
  const existing = await db.job.findUnique({ where: { id: jobId } });
  if (existing?.status === "cancelled") {
    return;
  }
  clearJobCancellation(jobId);
  const logger = createJobLogger({ jobId, sessionId: input.sessionId });

  await markJobRunning(jobId);
  if (input.sessionId) {
    await updateCampaignVideoStatus(input.sessionId, "running");
  }
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
      assertJobNotCancelled(jobId);
      await updateJobProgress(jobId, progress);
      await emitJobEvent({
        jobId,
        type: "progress",
        message,
        data: { progress, ...data }
      });
    },
    log: async (message, data) => {
      assertJobNotCancelled(jobId);
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
    assertJobNotCancelled(jobId);
    await handler(context);
    await completeJob(jobId);
    if (input.sessionId) {
      const session = await db.session.findUnique({ where: { id: input.sessionId } });
      await updateCampaignVideoStatus(input.sessionId, session?.status ?? "completed");
    }
    await logger.info("Job completed", { progress: 100 });
    await emitJobEvent({
      jobId,
      type: "status",
      message: "Job completed",
      data: { progress: 100 }
    });
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await cancelJobRecord(jobId, "Job cancelled by user");
      if (input.sessionId) {
        await db.session.update({
          where: { id: input.sessionId },
          data: {
            status: "cancelled",
            stage: "cancelled"
          }
        });
        await updateCampaignVideoStatus(input.sessionId, "cancelled");
      }
      await logger.warn("Job cancelled", { jobId });
      await emitJobEvent({
        jobId,
        type: "status",
        message: "Job cancelled",
        data: { status: "cancelled" }
      });
      return;
    }

    await failJob(jobId, error);
    if (input.sessionId) {
      const session = await db.session.findUnique({
        where: { id: input.sessionId },
        select: { stage: true }
      });
      await db.session.update({
        where: { id: input.sessionId },
        data: {
          status: "failed",
          stage: session?.stage?.endsWith("_failed") ? session.stage : "failed"
        }
      });
      await updateCampaignVideoStatus(input.sessionId, "failed");
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

export async function cancelJob(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (["completed", "failed", "cancelled", "interrupted"].includes(job.status)) {
    return job;
  }

  requestJobCancellation(jobId);
  const cancelled = await cancelJobRecord(jobId, "Job cancelled by user");

  if (job.sessionId) {
    await db.session.update({
      where: { id: job.sessionId },
      data: {
        status: "cancelled",
        stage: "cancelled"
      }
    });
    await updateCampaignVideoStatus(job.sessionId, "cancelled");
  }

  await emitJobEvent({
    jobId,
    type: "status",
    message: "Job cancellation requested",
    data: { status: "cancelled" }
  });

  return cancelled;
}

async function updateCampaignVideoStatus(sessionId: string, status: string) {
  await db.campaignVideo.updateMany({
    where: { sessionId },
    data: { status }
  });
}

export function getQueueStats() {
  return {
    pending: queue.pending,
    size: queue.size,
    isPaused: queue.isPaused,
    scheduled: scheduledJobIds.size
  };
}

function scheduleJob(jobId: string, input: CreateJobInput) {
  if (scheduledJobIds.has(jobId)) {
    return;
  }

  scheduledJobIds.add(jobId);
  queue
    .add(() => runJob(jobId, input))
    .catch(async (error) => {
      await failJob(jobId, error);
      await emitJobEvent({
        jobId,
        type: "error",
        message: error instanceof Error ? error.message : "Job failed before it started",
        data: { error: serializeError(error) }
      });
    })
    .finally(() => {
      scheduledJobIds.delete(jobId);
    });
}

function parseJobPayload(payloadJson: string) {
  const payload = JSON.parse(payloadJson) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
