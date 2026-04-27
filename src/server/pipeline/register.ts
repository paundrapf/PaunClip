import "server-only";
import { registerJobHandler } from "@/server/jobs/runner";
import { runRenderSelectedClips, runSingleVideoPipeline } from "./single-video-pipeline";

let registered = false;

export function registerPipelineJobs() {
  if (registered) {
    return;
  }

  registerJobHandler("single_video_pipeline", runSingleVideoPipeline);
  registerJobHandler("render_selected_clips", runRenderSelectedClips);
  registered = true;
}
