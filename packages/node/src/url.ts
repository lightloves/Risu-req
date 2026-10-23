import { ProtocolError } from "./errors.js";

export function validateAndParseUrl(rawUrl: string, baseUrl?: string): URL {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new ProtocolError("URL must be a non-empty string");
  }

  if (/[\r\n]/.test(rawUrl)) {
    throw new ProtocolError("URL must not contain carriage return or newline characters");
  }

  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch (error) {
    throw new ProtocolError(`Malformed URL: ${rawUrl}`, { cause: error });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProtocolError(`Unsupported protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
  }

  return parsed;
}

export function appendQueryParams(
  url: URL,
  params?: Record<string, unknown> | URLSearchParams | string
): URL {
  if (!params) {
    return url;
  }

  const result = new URL(url.toString());

  if (typeof params === "string") {
    const searchParams = new URLSearchParams(params);
    for (const [key, val] of searchParams.entries()) {
      result.searchParams.append(key, val);
    }
    return result;
  }

  if (params instanceof URLSearchParams) {
    for (const [key, val] of params.entries()) {
      result.searchParams.append(key, val);
    }
    return result;
  }

  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) {
      continue;
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item !== undefined && item !== null) {
          result.searchParams.append(key, String(item));
        }
      }
    } else {
      result.searchParams.append(key, String(val));
    }
  }

  return result;
}

export function isSameOrigin(firstUrl: URL | string, secondUrl: URL | string): boolean {
  const parsedFirst = typeof firstUrl === "string" ? new URL(firstUrl) : firstUrl;
  const parsedSecond = typeof secondUrl === "string" ? new URL(secondUrl) : secondUrl;
  return parsedFirst.origin === parsedSecond.origin;
}

export function redactUrlCredentials(inputUrl: URL | string): string {
  const parsed = typeof inputUrl === "string" ? new URL(inputUrl) : new URL(inputUrl.toString());
  if (parsed.password) {
    parsed.password = "***";
  }
  return parsed.toString();
}
