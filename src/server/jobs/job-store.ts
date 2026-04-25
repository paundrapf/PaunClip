import "server-only";
import { db } from "@/server/db/client";
import { serializeError } from "@/server/logging/logger";
import { stringifyJson } from "@/shared/schemas/primitives";
import type { CreateJobInput, JobEvent, JobStepName, JobStatus } from "@/shared/schemas/job";

export async function createJob(input: CreateJobInput) {
  return db.job.create({
    data: {
      type: input.type,
      sessionId: input.sessionId,
      payloadJson: stringifyJson(input.payload),
      status: "queued",
      progress: 0
    }
  });
}

export async function getJob(jobId: string) {
  return db.job.findUnique({
    where: { id: jobId },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" }, take: 100 }
    }
  });
}

export async function markJobRunning(jobId: string) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: new Date()
    }
  });
}

export async function updateJobProgress(jobId: string, progress: number) {
  return db.job.update({
    where: { id: jobId },
    data: {
      progress: clampProgress(progress)
    }
  });
}

export async function completeJob(jobId: string) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      progress: 100,
      finishedAt: new Date()
    }
  });
}

export async function failJob(jobId: string, error: unknown) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: "failed",
      errorJson: stringifyJson(normalizeError(error)),
      finishedAt: new Date()
    }
  });
}

export async function interruptStaleRunningJobs() {
  await db.job.updateMany({
    where: { status: "running" },
    data: {
      status: "interrupted",
      finishedAt: new Date()
    }
  });
}

export async function setJobStep(
  jobId: string,
  name: JobStepName,
  data: {
    status: JobStatus | "pending";
    progress?: number;
    message?: string;
    error?: unknown;
  }
) {
  const now = new Date();
  return db.jobStep.upsert({
    where: {
      jobId_name: {
        jobId,
        name
      }
    },
    create: {
      jobId,
      name,
      status: data.status,
      progress: clampProgress(data.progress ?? 0),
      message: data.message,
      errorJson: data.error ? stringifyJson(normalizeError(data.error)) : undefined,
      startedAt: data.status === "running" ? now : undefined,
      finishedAt: ["completed", "failed", "cancelled", "interrupted"].includes(data.status)
        ? now
        : undefined
    },
    update: {
      status: data.status,
      progress: clampProgress(data.progress ?? 0),
      message: data.message,
      errorJson: data.error ? stringifyJson(normalizeError(data.error)) : undefined,
      startedAt: data.status === "running" ? now : undefined,
      finishedAt: ["completed", "failed", "cancelled", "interrupted"].includes(data.status)
        ? now
        : undefined
    }
  });
}

export async function emitJobEvent(event: JobEvent) {
  return db.jobEvent.create({
    data: {
      jobId: event.jobId,
      type: event.type,
      message: event.message,
      dataJson: event.data ? stringifyJson(event.data) : undefined
    }
  });
}

export async function listJobEvents(jobId: string, after?: Date) {
  return db.jobEvent.findMany({
    where: {
      jobId,
      ...(after ? { createdAt: { gt: after } } : {})
    },
    orderBy: { createdAt: "asc" },
    take: 200
  });
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeError(error: unknown) {
  return serializeError(error);
}
