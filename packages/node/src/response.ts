import { Readable, Transform } from "node:stream";
import * as zlib from "node:zlib";
import { ProtocolError, ResponseSizeLimitError } from "./errors.js";

export interface ResponseInit {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  rawHeaders: string[];
  url: string;
  rawStream: Readable;
  maxResponseSize?: number;
  decompress?: boolean;
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

  private readonly rawStream: Readable;
  private readonly maxResponseSize?: number;
  private readonly shouldDecompress: boolean;
  private bodyUsed = false;
  private cachedBuffer: Buffer | null = null;

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
  }

  stream(): Readable {
    if (this.bodyUsed) {
      throw new ProtocolError("Response body has already been consumed");
    }
    this.bodyUsed = true;

    let currentStream = this.rawStream;

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

    if (this.shouldDecompress) {
      const contentEncoding = (this.headers["content-encoding"] || "").trim().toLowerCase();
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

    return currentStream;
  }

  async bytes(): Promise<Buffer> {
    if (this.cachedBuffer) {
      return this.cachedBuffer;
    }

    const readable = this.stream();
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      readable.on("data", (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      readable.on("end", () => {
        this.cachedBuffer = Buffer.concat(chunks);
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
}
