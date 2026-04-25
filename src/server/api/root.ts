import "server-only";
import { createTRPCRouter } from "./trpc";
import { campaignRouter } from "./routers/campaign";
import { clipRouter } from "./routers/clip";
import { jobRouter } from "./routers/job";
import { sessionRouter } from "./routers/session";
import { settingsRouter } from "./routers/settings";

export const appRouter = createTRPCRouter({
  campaign: campaignRouter,
  clip: clipRouter,
  job: jobRouter,
  session: sessionRouter,
  settings: settingsRouter
});

export type AppRouter = typeof appRouter;
