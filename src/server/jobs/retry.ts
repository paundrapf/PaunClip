import "server-only";
import { JobCancelledError } from "@/server/jobs/process-registry";

type RetryOptions = {
  attempts?: number;
  label: string;
  backoffMs?: (attempt: number) => number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: {
    label: string;
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
  }) => Promise<void> | void;
};

export async function withRetry<T>(work: () => Promise<T>, options: RetryOptions) {
  const maxAttempts = Math.max(1, options.attempts ?? 3);
  const backoffMs = options.backoffMs ?? ((attempt) => Math.min(5000 * 3 ** (attempt - 1), 60_000));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof JobCancelledError) {
        throw error;
      }

      lastError = error;
      const canRetry = attempt < maxAttempts && (options.shouldRetry?.(error, attempt) ?? true);
      if (!canRetry) {
        throw error;
      }

      const delayMs = backoffMs(attempt);
      await options.onRetry?.({
        label: options.label,
        attempt,
        maxAttempts,
        delayMs,
        error
      });
      await delay(delayMs);
    }
  }

  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
