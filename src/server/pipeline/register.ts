import "server-only";
import { registerJobHandler } from "@/server/jobs/runner";
import { runSingleVideoPipeline } from "./single-video-pipeline";

let registered = false;

export function registerPipelineJobs() {
  if (registered) {
    return;
  }

  registerJobHandler("single_video_pipeline", runSingleVideoPipeline);
  registered = true;
}
