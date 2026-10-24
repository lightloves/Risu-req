import type { Readable } from "node:stream";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | (string & {});

export type HeaderValue = string | number | string[];
export type HeadersRecord = Record<string, HeaderValue | undefined>;
export type HeadersInit = HeadersRecord | [string, string][] | Map<string, string>;

export interface TimeoutOptions {
  connect?: number;
  read?: number;
  total?: number;
}

export type TimeoutInput = number | TimeoutOptions;

export interface ProxyAuth {
  username: string;
  password: string;
}

export interface ProxyOptions {
  url: string;
  auth?: ProxyAuth;
  bypass?: string[];
}

export type ProxyInput = string | ProxyOptions;

export interface RetryOptions {
  maxRetries?: number;
  backoffFactor?: number;
  maxDelay?: number;
  retryAfter?: boolean;
  statusCodes?: number[];
  retryMethods?: string[];
}

export type RetryInput = boolean | RetryOptions;

export interface PoolOptions {
  maxSockets?: number;
  maxFreeSockets?: number;
  idleTimeout?: number;
  keepAlive?: boolean;
}

export interface TlsOptions {
  ca?: string | Buffer | Array<string | Buffer>;
  cert?: string | Buffer;
  key?: string | Buffer;
  rejectUnauthorized?: boolean;
  servername?: string;
}

export interface RequestLogInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
  hasBody: boolean;
}

export interface ResponseLogInfo {
  method: string;
  url: string;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  durationMs: number;
}

export interface ErrorLogInfo {
  method: string;
  url: string;
  error: Error;
  durationMs: number;
}

export interface RetryLogInfo {
  method: string;
  url: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  reason: string;
}

export interface LoggingHooks {
  onRequest?: (info: RequestLogInfo) => void;
  onResponse?: (info: ResponseLogInfo) => void;
  onError?: (info: ErrorLogInfo) => void;
  onRetry?: (info: RetryLogInfo) => void;
}

export interface FormDataField {
  name: string;
  value: string | Buffer | Uint8Array | Readable;
  filename?: string;
  contentType?: string;
}

export interface ClientOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  timeout?: TimeoutInput;
  proxy?: ProxyInput;
  retries?: RetryInput;
  pool?: PoolOptions;
  tls?: TlsOptions;
  cookies?: boolean | CookieJarLike;
  ssrfProtection?: boolean;
  maxResponseSize?: number;
  maxRedirects?: number;
  followRedirects?: boolean;
  logging?: LoggingHooks;
}

export interface RequestOptions {
  method?: HttpMethod;
  headers?: HeadersInit;
  params?: Record<string, unknown> | URLSearchParams | string;
  query?: Record<string, unknown> | URLSearchParams | string;
  body?: string | Buffer | Uint8Array | Readable;
  json?: unknown;
  form?: Record<string, unknown> | string;
  formData?: FormDataField[] | Record<string, unknown>;
  timeout?: TimeoutInput;
  proxy?: ProxyInput | false;
  retries?: RetryInput;
  tls?: TlsOptions;
  signal?: AbortSignal;
  maxResponseSize?: number;
  maxRedirects?: number;
  followRedirects?: boolean;
  ssrfProtection?: boolean;
  decompress?: boolean;
  validateStatus?: (status: number) => boolean;
}

export interface CookieEntry {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface CookieJarLike {
  getCookieString(url: string | URL): string;
  setCookie(rawHeader: string | CookieEntry, url: string | URL): void;
  setCookies(rawHeaders: string[] | string, url: string | URL): void;
  clear(): void;
  getCookies(url: string | URL): CookieEntry[];
}
