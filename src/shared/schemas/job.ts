import { z } from "zod";
import { JOB_STATUSES, JOB_STEP_NAMES } from "@/shared/constants/app";
import { percentageSchema } from "./primitives";

export const jobStatusSchema = z.enum(JOB_STATUSES);
export const jobStepNameSchema = z.enum(JOB_STEP_NAMES);

export const jobTypeSchema = z.enum([
  "single_video_pipeline",
  "render_selected_clips",
  "campaign_fetch",
  "campaign_batch_pipeline",
  "cleanup"
]);

export const jobEventSchema = z.object({
  jobId: z.string(),
  type: z.enum(["status", "progress", "step", "warning", "error", "log"]),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime().optional()
});

export const createJobInputSchema = z.object({
  type: jobTypeSchema,
  sessionId: z.string().optional(),
  payload: z.record(z.unknown()).default({})
});

export const jobSnapshotSchema = z.object({
  id: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  progress: percentageSchema,
  sessionId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobStepName = z.infer<typeof jobStepNameSchema>;
export type JobEvent = z.infer<typeof jobEventSchema>;
export type CreateJobInput = z.infer<typeof createJobInputSchema>;
