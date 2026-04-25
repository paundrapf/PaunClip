import "server-only";
import { PrismaClient } from "@prisma/client";
import { env } from "@/server/config/env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.PRISMA_QUERY_LOGS ? ["query", "error", "warn"] : ["error", "warn"]
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
