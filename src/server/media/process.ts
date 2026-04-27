import "server-only";
import { spawn } from "node:child_process";
import {
  assertJobNotCancelled,
  isJobCancellationRequested,
  JobCancelledError,
  trackJobProcess
} from "@/server/jobs/process-registry";

export type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type ProcessLine = {
  stream: "stdout" | "stderr";
  line: string;
};

export class ProcessError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    public readonly result: ProcessResult,
    public readonly timedOut = false
  ) {
    super(formatProcessError(command, result, timedOut));
    this.name = "ProcessError";
  }
}

export function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    idleTimeoutMs?: number;
    jobId?: string;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onLine?: (event: ProcessLine) => void;
    onHeartbeat?: (result: { elapsedMs: number; idleMs: number }) => void;
    heartbeatMs?: number;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    assertJobNotCancelled(options.jobId);

    let settled = false;
    let lastOutputAt = Date.now();
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false
    });
    const untrack = trackJobProcess(options.jobId, child);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutLineBuffer = "";
    let stderrLineBuffer = "";

    const heartbeat = options.onHeartbeat
      ? setInterval(() => {
          const now = Date.now();
          options.onHeartbeat?.({
            elapsedMs: now - startedAt,
            idleMs: now - lastOutputAt
          });
        }, options.heartbeatMs ?? 15_000)
      : null;

    const idleTimeout = options.idleTimeoutMs
      ? setInterval(() => {
          if (settled || Date.now() - lastOutputAt < options.idleTimeoutMs!) {
            return;
          }
          finish(
            new ProcessError(
              command,
              args,
              {
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
                exitCode: 1
              },
              true
            )
          );
          child.kill("SIGTERM");
        }, Math.min(options.idleTimeoutMs, 15_000))
      : null;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          finish(
            new ProcessError(
              command,
              args,
              {
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: Buffer.concat(stderr).toString("utf8"),
                exitCode: 1
              },
              true
            )
          );
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      const text = Buffer.from(chunk).toString("utf8");
      lastOutputAt = Date.now();
      stdout.push(Buffer.from(chunk));
      options.onStdout?.(text);
      stdoutLineBuffer = emitLines("stdout", stdoutLineBuffer + text, options.onLine);
    });
    child.stderr.on("data", (chunk) => {
      const text = Buffer.from(chunk).toString("utf8");
      lastOutputAt = Date.now();
      stderr.push(Buffer.from(chunk));
      options.onStderr?.(text);
      stderrLineBuffer = emitLines("stderr", stderrLineBuffer + text, options.onLine);
    });
    child.on("error", (error) => {
      finish(error);
    });
    child.on("close", (exitCode) => {
      if (stdoutLineBuffer.trim()) {
        options.onLine?.({ stream: "stdout", line: stdoutLineBuffer.trim() });
      }
      if (stderrLineBuffer.trim()) {
        options.onLine?.({ stream: "stderr", line: stderrLineBuffer.trim() });
      }

      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: exitCode ?? 1
      };

      if (isJobCancellationRequested(options.jobId)) {
        finish(new JobCancelledError(options.jobId!));
        return;
      }

      if (result.exitCode !== 0) {
        finish(new ProcessError(command, args, result));
        return;
      }

      finish(undefined, result);
    });

    function finish(error?: unknown, result?: ProcessResult) {
      if (settled) {
        return;
      }
      settled = true;
      untrack();
      if (timeout) {
        clearTimeout(timeout);
      }
      if (idleTimeout) {
        clearInterval(idleTimeout);
      }
      if (heartbeat) {
        clearInterval(heartbeat);
      }

      if (error) {
        reject(error);
        return;
      }
      resolve(result!);
    }
  });
}

function emitLines(
  stream: "stdout" | "stderr",
  value: string,
  onLine?: (event: ProcessLine) => void
) {
  if (!onLine) {
    return "";
  }

  const normalized = value.replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      onLine({ stream, line: trimmed });
    }
  }

  return remainder;
}

function formatProcessError(command: string, result: ProcessResult, timedOut: boolean) {
  const output = truncateOutput(result.stderr || result.stdout || "No process output");
  const reason = timedOut ? "timed out" : `exited with ${result.exitCode}`;
  return `${command} ${reason}: ${output}`;
}

export function truncateOutput(value: string, maxLength = 1800) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
