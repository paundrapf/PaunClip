import "server-only";
import { spawn } from "node:child_process";

export type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
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
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGTERM");
          reject(
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

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }

      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: exitCode ?? 1
      };

      if (result.exitCode !== 0) {
        reject(new ProcessError(command, args, result));
        return;
      }

      resolve(result);
    });
  });
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
