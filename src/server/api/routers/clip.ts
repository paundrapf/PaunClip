import "server-only";
import { z } from "zod";
import { db } from "@/server/db/client";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const clipRouter = createTRPCRouter({
  listBySession: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    return db.clip.findMany({
      where: { sessionId: input },
      orderBy: [{ viralityScore: "desc" }, { createdAt: "desc" }]
    });
  }),

  byId: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    return db.clip.findUnique({
      where: { id: input },
      include: { highlight: true, session: true }
    });
  })
});
