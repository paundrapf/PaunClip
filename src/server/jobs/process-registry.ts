import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const activeProcesses = new Map<string, Set<ChildProcessWithoutNullStreams>>();
const cancelledJobs = new Set<string>();

export class JobCancelledError extends Error {
  constructor(public readonly jobId: string) {
    super(`Job cancelled: ${jobId}`);
    this.name = "JobCancelledError";
  }
}

export function clearJobCancellation(jobId: string) {
  cancelledJobs.delete(jobId);
}

export function isJobCancellationRequested(jobId?: string) {
  return jobId ? cancelledJobs.has(jobId) : false;
}

export function assertJobNotCancelled(jobId?: string) {
  if (jobId && isJobCancellationRequested(jobId)) {
    throw new JobCancelledError(jobId);
  }
}

export function trackJobProcess(jobId: string | undefined, child: ChildProcessWithoutNullStreams) {
  if (!jobId) {
    return () => undefined;
  }

  if (cancelledJobs.has(jobId)) {
    terminateChildProcess(child);
    throw new JobCancelledError(jobId);
  }

  const processes = activeProcesses.get(jobId) ?? new Set<ChildProcessWithoutNullStreams>();
  processes.add(child);
  activeProcesses.set(jobId, processes);

  return () => {
    processes.delete(child);
    if (processes.size === 0) {
      activeProcesses.delete(jobId);
    }
  };
}

export function requestJobCancellation(jobId: string) {
  cancelledJobs.add(jobId);
  const processes = activeProcesses.get(jobId);
  if (!processes) {
    return;
  }

  for (const child of processes) {
    terminateChildProcess(child);
  }
}

function terminateChildProcess(child: ChildProcessWithoutNullStreams) {
  if (child.killed) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      shell: false
    }).once("error", () => {
      child.kill("SIGTERM");
    });
    return;
  }

  child.kill("SIGTERM");
}
