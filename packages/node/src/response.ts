import { Readable, Transform } from "node:stream";
import * as zlib from "node:zlib";
import { ProtocolError, ResponseSizeLimitError } from "./errors.js";
import type { RateLimitInfo, DiagnosticsInfo } from "./types.js";
import { parseRateLimitHeaders, parseRetryAfter } from "./retry.js";

export interface ResponseInit {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  url: string;
  rawStream: Readable;
  maxResponseSize?: number;
  decompress?: boolean;
  method?: string;
  redirectHops?: number;
  authenticated?: boolean;
  cookiesSent?: boolean;
}

export class RisuResponse {
  readonly statusCode: number;
  readonly status: number;
  readonly statusText: string;
  readonly reason: string;
  readonly headers: Record<string, string>;
  readonly rawHeaders: string[];
  readonly url: string;
  readonly ok: boolean;
  readonly method?: string;
  readonly redirectHops: number;
  readonly authenticated: boolean;
  readonly cookiesSent: boolean;

  private readonly rawStream: Readable;
  private readonly maxResponseSize?: number;
  private readonly shouldDecompress: boolean;
  private bodyUsed = false;
  private cachedBuffer: Buffer | null = null;
  private _rateLimitInfo?: RateLimitInfo | null;

  constructor(init: ResponseInit) {
    this.statusCode = init.statusCode;
    this.status = init.statusCode;
    this.statusText = init.statusText;
    this.reason = init.statusText;
    this.headers = init.headers;
    this.rawHeaders = init.rawHeaders;
    this.url = init.url;
    this.ok = init.statusCode >= 200 && init.statusCode < 300;
    this.rawStream = init.rawStream;
    this.maxResponseSize = init.maxResponseSize;
    this.shouldDecompress = init.decompress ?? true;
    this.method = init.method;
    this.redirectHops = init.redirectHops ?? 0;
    this.authenticated = init.authenticated ?? false;
    this.cookiesSent = init.cookiesSent ?? false;
  }

  stream(): Readable {
    if (this.bodyUsed) {
      throw new ProtocolError("Response body has already been consumed");
    }
    this.bodyUsed = true;

    let currentStream = this.rawStream;
    const contentEncoding = (this.headers["content-encoding"] || "").trim().toLowerCase();

    if (this.shouldDecompress && contentEncoding) {
      if (contentEncoding === "gzip") {
        const gunzip = zlib.createGunzip();
        currentStream = currentStream.pipe(gunzip);
      } else if (contentEncoding === "deflate") {
        const inflate = zlib.createInflate();
        currentStream = currentStream.pipe(inflate);
      } else if (contentEncoding === "br") {
        const brotli = zlib.createBrotliDecompress();
        currentStream = currentStream.pipe(brotli);
      }
    }

    if (this.maxResponseSize !== undefined && this.maxResponseSize > 0) {
      let receivedBytes = 0;
      const max = this.maxResponseSize;
      const sizeLimiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > max) {
            callback(
              new ResponseSizeLimitError(
                `Response exceeded maximum size limit of ${max} bytes`,
                max,
                receivedBytes
              )
            );
          } else {
            callback(null, chunk);
          }
        },
      });
      currentStream = currentStream.pipe(sizeLimiter);
    }

    return currentStream;
  }

  async bytes(): Promise<Buffer> {
    if (this.cachedBuffer) {
      return this.cachedBuffer;
    }

    const readable = this.stream();
    const chunks: Buffer[] = [];
    const expectedLengthStr = this.headers["content-length"];
    const contentEncoding = (this.headers["content-encoding"] || "").trim();
    const expectedLength =
      expectedLengthStr && !contentEncoding ? Number.parseInt(expectedLengthStr, 10) : null;

    const isBodyForbidden =
      this.statusCode === 204 ||
      this.statusCode === 304 ||
      (this.statusCode >= 100 && this.statusCode < 200) ||
      (this.method && this.method.toUpperCase() === "HEAD");

    return new Promise<Buffer>((resolve, reject) => {
      readable.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      readable.on("end", () => {
        this.cachedBuffer = Buffer.concat(chunks);
        if (
          !isBodyForbidden &&
          expectedLength !== null &&
          !Number.isNaN(expectedLength) &&
          this.cachedBuffer.length !== expectedLength
        ) {
          reject(
            new ProtocolError(
              `Premature response end: expected ${expectedLength} bytes from Content-Length, received ${this.cachedBuffer.length} bytes`,
              { url: this.url, statusCode: this.statusCode }
            )
          );
          return;
        }
        resolve(this.cachedBuffer);
      });
      readable.on("error", (error) => {
        reject(error);
      });
    });
  }

  async buffer(): Promise<Buffer> {
    return this.bytes();
  }

  async text(): Promise<string> {
    const buf = await this.bytes();
    return buf.toString("utf8");
  }

  async json<T = unknown>(): Promise<T> {
    const textContent = await this.text();
    try {
      return JSON.parse(textContent) as T;
    } catch (error) {
      throw new ProtocolError(`Failed to parse response body as JSON: ${String(error)}`, {
        cause: error,
        url: this.url,
        statusCode: this.statusCode,
      });
    }
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  get isRateLimited(): boolean {
    return this.statusCode === 429 || (this.statusCode === 503 && Boolean(this.headers["retry-after"]));
  }

  get retryAfter(): number | null {
    const raw = this.headers["retry-after"];
    if (!raw) return null;
    const ms = parseRetryAfter(raw);
    return ms !== null ? ms / 1000 : null;
  }

  get rateLimit(): RateLimitInfo | null {
    if (this._rateLimitInfo === undefined) {
      this._rateLimitInfo = parseRateLimitHeaders(this.headers, this.statusCode);
    }
    return this._rateLimitInfo;
  }

  /**
   * Drain the unconsumed stream so underlying keep-alive sockets are returned to the pool.
   */
  async drain(): Promise<void> {
    if (this.bodyUsed) {
      return;
    }
    this.bodyUsed = true;
    if (this.rawStream.readableEnded || this.rawStream.destroyed) {
      return;
    }
    return new Promise<void>((resolve) => {
      const finish = () => resolve();
      this.rawStream.once("end", finish);
      this.rawStream.once("close", finish);
      this.rawStream.once("error", finish);
      try {
        this.rawStream.resume();
      } catch {
        resolve();
      }
    });
  }

  async close(): Promise<void> {
    await this.drain();
  }

  diagnostics(): DiagnosticsInfo {
    const rateLimit = this.rateLimit;
    const isRateLimited = this.isRateLimited;

    let cause = "Request completed normally";
    if (isRateLimited) {
      if (rateLimit?.retryAfter !== undefined) {
        cause = `Rate limit exceeded (HTTP ${this.statusCode}). Upstream requested Retry-After ${rateLimit.retryAfter}s.`;
      } else if (rateLimit?.remaining === 0) {
        cause = `Rate limit quota exhausted (HTTP ${this.statusCode}). Remaining quota is 0.`;
      } else {
        cause = `Rate limit exceeded (HTTP ${this.statusCode} Too Many Requests).`;
      }
    } else if (this.statusCode >= 400) {
      cause = `HTTP request failed with status ${this.statusCode} ${this.statusText}`;
    }

    return {
      statusCode: this.statusCode,
      url: this.url,
      method: this.method ?? "GET",
      isRateLimited,
      rateLimit,
      authenticated: this.authenticated,
      cookiesSent: this.cookiesSent,
      redirectCount: this.redirectHops,
      cause,
    };
  }
}
