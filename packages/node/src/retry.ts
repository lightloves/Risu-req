import { RisuError, TimeoutError, ConnectionError, DnsError } from "./errors.js";
import type { RetryInput, RetryOptions } from "./types.js";

const DEFAULT_RETRYABLE_STATUS_CODES = [429, 502, 503, 504];
const DEFAULT_RETRYABLE_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];

export function normalizeRetryOptions(input?: RetryInput): RetryOptions | null {
  if (input === false || input === undefined) {
    return null;
  }
  if (input === true) {
    return {
      maxRetries: 3,
      backoffFactor: 0.3,
      maxDelay: 10000,
      retryAfter: true,
      statusCodes: DEFAULT_RETRYABLE_STATUS_CODES,
      retryMethods: DEFAULT_RETRYABLE_METHODS,
    };
  }
  return {
    maxRetries: input.maxRetries ?? 3,
    backoffFactor: input.backoffFactor ?? 0.3,
    maxDelay: input.maxDelay ?? 10000,
    retryAfter: input.retryAfter ?? true,
    statusCodes: input.statusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
    retryMethods: input.retryMethods ?? DEFAULT_RETRYABLE_METHODS,
  };
}

export function parseRetryAfter(headerValue?: string): number | null {
  if (!headerValue) {
    return null;
  }

  const seconds = Number.parseInt(headerValue.trim(), 10);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }

  return null;
}

export function calculateRetryDelay(
  attempt: number,
  options: RetryOptions,
  retryAfterHeader?: string
): number {
  const maxDelay = options.maxDelay ?? 10000;

  if (options.retryAfter && retryAfterHeader) {
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    if (retryAfterMs !== null) {
      return Math.min(retryAfterMs, maxDelay);
    }
  }

  const factor = options.backoffFactor ?? 0.3;
  const baseMs = factor * 1000 * Math.pow(2, attempt - 1);
  const jitterMs = Math.random() * (factor * 500);
  const totalMs = baseMs + jitterMs;

  return Math.min(totalMs, maxDelay);
}

export function isRetryableMethod(method: string, options: RetryOptions): boolean {
  const allowed = options.retryMethods ?? DEFAULT_RETRYABLE_METHODS;
  return allowed.map((m) => m.toUpperCase()).includes(method.toUpperCase());
}

export function isRetryableStatusCode(statusCode: number, options: RetryOptions): boolean {
  const codes = options.statusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
  return codes.includes(statusCode);
}

export function isRetryableError(error: unknown): boolean {
  if (
    error instanceof TimeoutError ||
    error instanceof ConnectionError ||
    error instanceof DnsError
  ) {
    return true;
  }

  if (error instanceof RisuError) {
    return false;
  }

  const sys = error as { code?: string };
  if (
    sys?.code === "ECONNRESET" ||
    sys?.code === "ETIMEDOUT" ||
    sys?.code === "ECONNREFUSED" ||
    sys?.code === "EPIPE" ||
    sys?.code === "EAI_AGAIN"
  ) {
    return true;
  }

  return false;
}
