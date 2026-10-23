export interface RisuErrorOptions {
  cause?: unknown;
  code?: string;
  url?: string;
  method?: string;
  statusCode?: number;
}

export class RisuError extends Error {
  readonly code: string;
  readonly url?: string;
  readonly method?: string;
  readonly statusCode?: number;
  override readonly cause?: unknown;

  constructor(message: string, options?: RisuErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options?.code ?? "ERR_RISU_REQUEST";
    this.url = options?.url;
    this.method = options?.method;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DnsError extends RisuError {
  constructor(message: string, options?: RisuErrorOptions) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_DNS" });
  }
}

export class TlsError extends RisuError {
  constructor(message: string, options?: RisuErrorOptions) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_TLS" });
  }
}

export class TimeoutError extends RisuError {
  readonly phase?: "connect" | "read" | "total";

  constructor(
    message: string,
    options?: RisuErrorOptions & { phase?: "connect" | "read" | "total" }
  ) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_TIMEOUT" });
    this.phase = options?.phase;
  }
}

export class ConnectionError extends RisuError {
  constructor(message: string, options?: RisuErrorOptions) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_CONNECTION" });
  }
}

export class ProtocolError extends RisuError {
  constructor(message: string, options?: RisuErrorOptions) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_PROTOCOL" });
  }
}

export class MaxRedirectsError extends RisuError {
  readonly redirectCount: number;

  constructor(
    message: string,
    redirectCount: number,
    options?: RisuErrorOptions
  ) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_MAX_REDIRECTS" });
    this.redirectCount = redirectCount;
  }
}

export class ResponseSizeLimitError extends RisuError {
  readonly maxBytes: number;
  readonly receivedBytes: number;

  constructor(
    message: string,
    maxBytes: number,
    receivedBytes: number,
    options?: RisuErrorOptions
  ) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_RESPONSE_SIZE" });
    this.maxBytes = maxBytes;
    this.receivedBytes = receivedBytes;
  }
}

export class ProxyError extends RisuError {
  constructor(message: string, options?: RisuErrorOptions) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_PROXY" });
  }
}

export class SsrfError extends RisuError {
  readonly host: string;
  readonly resolvedAddress?: string;

  constructor(
    message: string,
    host: string,
    resolvedAddress?: string,
    options?: RisuErrorOptions
  ) {
    super(message, { ...options, code: options?.code ?? "ERR_RISU_SSRF" });
    this.host = host;
    this.resolvedAddress = resolvedAddress;
  }
}

export function classifySystemError(
  error: unknown,
  context: { url: string; method: string }
): RisuError {
  if (error instanceof RisuError) {
    return error;
  }

  const sysErr = error as NodeJS.ErrnoException & {
    code?: string;
    message?: string;
  };
  const code = sysErr?.code ?? "";
  const msg = sysErr?.message ?? String(error);

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ENODATA" ||
    code === "EAI_FAIL"
  ) {
    return new DnsError(`DNS lookup failed: ${msg}`, {
      cause: error,
      code,
      url: context.url,
      method: context.method,
    });
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH"
  ) {
    return new ConnectionError(`Connection failed (${code}): ${msg}`, {
      cause: error,
      code,
      url: context.url,
      method: context.method,
    });
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  ) {
    return new TimeoutError(`Operation timed out (${code}): ${msg}`, {
      cause: error,
      code,
      url: context.url,
      method: context.method,
    });
  }

  if (
    code.startsWith("ERR_TLS_") ||
    code.startsWith("ERR_SSL_") ||
    code === "CERT_HAS_EXPIRED" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "UNABLE_TO_GET_ISSUER_CERT" ||
    code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
  ) {
    return new TlsError(`TLS validation failed: ${msg}`, {
      cause: error,
      code,
      url: context.url,
      method: context.method,
    });
  }

  if (code === "HPE_INVALID_HEADER_TOKEN" || code === "ERR_HTTP_TRAILER_INVALID") {
    return new ProtocolError(`HTTP protocol violation: ${msg}`, {
      cause: error,
      code,
      url: context.url,
      method: context.method,
    });
  }

  return new ConnectionError(`Network request failed: ${msg}`, {
    cause: error,
    code,
    url: context.url,
    method: context.method,
  });
}
