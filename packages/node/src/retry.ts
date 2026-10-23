import { RisuError, TimeoutError, ConnectionError, DnsError } from "./errors.js";
import type { RetryInput, RetryOptions, RateLimitInfo } from "./types.js";

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

  const trimmed = headerValue.trim();
  const seconds = Number.parseFloat(trimmed);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : 0;
  }

  return null;
}

export function parseRateLimitHeaders(
  headers: Record<string, string>,
  statusCode: number
): RateLimitInfo | null {
  const is429 = statusCode === 429;
  const retryAfterHdr = headers["retry-after"];
  const is503WithRetryAfter = statusCode === 503 && Boolean(retryAfterHdr);

  const isRateLimited = is429 || is503WithRetryAfter;

  const retryAfterMs = parseRetryAfter(retryAfterHdr);
  const retryAfterSec = retryAfterMs !== null ? retryAfterMs / 1000 : undefined;

  const limitHdr = headers["x-ratelimit-limit"] ?? headers["ratelimit-limit"];
  const remainingHdr = headers["x-ratelimit-remaining"] ?? headers["ratelimit-remaining"];
  const resetHdr = headers["x-ratelimit-reset"] ?? headers["ratelimit-reset"];
  const resetAfterHdr = headers["x-ratelimit-reset-after"] ?? headers["ratelimit-reset-after"];
  const scope = headers["x-ratelimit-scope"] ?? headers["ratelimit-scope"];

  const limit = limitHdr ? Number.parseInt(limitHdr.trim(), 10) : undefined;
  const remaining = remainingHdr ? Number.parseInt(remainingHdr.trim(), 10) : undefined;
  const reset = resetHdr ? Number.parseFloat(resetHdr.trim()) : undefined;
  const resetAfter = resetAfterHdr ? Number.parseFloat(resetAfterHdr.trim()) : undefined;

  if (!isRateLimited && limit === undefined && remaining === undefined && reset === undefined && !retryAfterHdr) {
    return null;
  }

  return {
    isRateLimited,
    retryAfter: retryAfterSec,
    limit: !Number.isNaN(limit) ? limit : undefined,
    remaining: !Number.isNaN(remaining) ? remaining : undefined,
    reset: !Number.isNaN(reset) ? reset : undefined,
    resetAfter: !Number.isNaN(resetAfter) ? resetAfter : undefined,
    scope,
  };
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
      const jitter = Math.random() * 250;
      return Math.min(retryAfterMs + jitter, maxDelay);
    }
  }

  const factor = options.backoffFactor ?? 0.3;
  const baseMs = factor * 1000 * Math.pow(2, attempt - 1);
  const boundedBaseMs = Math.min(baseMs, maxDelay);
  const jitterMs = Math.random() * (factor * 500);
  const totalMs = boundedBaseMs * 0.5 + Math.random() * (boundedBaseMs * 0.5) + jitterMs;

  return Math.min(Math.max(0, totalMs), maxDelay);
}

export function isRetryableMethod(method: string, options: RetryOptions): boolean {
  const allowed = options.retryMethods ?? DEFAULT_RETRYABLE_METHODS;
  return allowed.map((m) => m.toUpperCase()).includes(method.toUpperCase());
}

export function isRetryableStatusCode(statusCode: number, options: RetryOptions): boolean {
  const codes = options.statusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
  return codes.includes(statusCode);
}

export function isReplayableBody(body: unknown): boolean {
  if (body && typeof body === "object" && "pipe" in body && typeof (body as any).pipe === "function") {
    return false;
  }
  return true;
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
