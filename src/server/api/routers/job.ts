import "server-only";
import { z } from "zod";
import { cancelJob, getQueueStats, resumeQueuedJobs } from "@/server/jobs/runner";
import { getJob } from "@/server/jobs/job-store";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const jobRouter = createTRPCRouter({
  byId: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    registerPipelineJobs();
    await resumeQueuedJobs();

    return getJob(input);
  }),

  queueStats: publicProcedure.query(async () => {
    registerPipelineJobs();
    await resumeQueuedJobs();

    return getQueueStats();
  }),

  cancel: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    return cancelJob(input);
  })
});
