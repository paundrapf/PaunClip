import "server-only";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export async function createTRPCContext() {
  return {};
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
