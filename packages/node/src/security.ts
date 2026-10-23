import { ProtocolError } from "./errors.js";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
]);

const SENSITIVE_PARAM_NAMES = new Set([
  "token",
  "secret",
  "password",
  "api_key",
  "apikey",
  "key",
  "access_token",
  "auth",
]);

export function validateHeader(name: string, value: string): void {
  if (typeof name !== "string" || name.trim() === "") {
    throw new ProtocolError("Header name must be a non-empty string");
  }

  if (!/^[a-zA-Z0-9!#$%&'*+-.^_`|~]+$/.test(name)) {
    throw new ProtocolError(`Invalid character in header name: ${name}`);
  }

  if (typeof value !== "string") {
    throw new ProtocolError(`Header value for ${name} must be a string`);
  }

  if (/[\r\n]/.test(value)) {
    throw new ProtocolError(`Header value for ${name} must not contain newline or carriage return characters`);
  }
}

export function sanitizeRedirectHeaders(
  headers: Record<string, string>,
  fromUrl: URL,
  toUrl: URL,
  allowInsecureDowngrade: boolean = false
): Record<string, string> {
  if (fromUrl.protocol === "https:" && toUrl.protocol === "http:" && !allowInsecureDowngrade) {
    throw new ProtocolError(`Insecure redirect downgrade from HTTPS to HTTP blocked: ${toUrl.toString()}`);
  }

  const result: Record<string, string> = { ...headers };

  if (fromUrl.origin !== toUrl.origin) {
    delete result["authorization"];
    delete result["Authorization"];
    delete result["proxy-authorization"];
    delete result["Proxy-Authorization"];
    delete result["cookie"];
    delete result["Cookie"];
  }

  return result;
}

export function redactHeadersForLogging(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export function redactUrlForLogging(url: string | URL): string {
  const parsed = typeof url === "string" ? new URL(url) : new URL(url.toString());
  if (parsed.password) {
    parsed.password = "***";
  }

  for (const [key] of parsed.searchParams.entries()) {
    if (SENSITIVE_PARAM_NAMES.has(key.toLowerCase())) {
      parsed.searchParams.set(key, "***");
    }
  }

  return parsed.toString();
}
