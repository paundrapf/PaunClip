import "server-only";
import { z } from "zod";
import { cancelJob, getQueueStats } from "@/server/jobs/runner";
import { getJob } from "@/server/jobs/job-store";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const jobRouter = createTRPCRouter({
  byId: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    return getJob(input);
  }),

  queueStats: publicProcedure.query(() => {
    return getQueueStats();
  }),

  cancel: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    return cancelJob(input);
  })
});
