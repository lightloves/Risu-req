import * as http from "node:http";
import * as https from "node:https";
import * as crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  RisuError,
  TimeoutError,
  MaxRedirectsError,
  classifySystemError,
} from "./errors.js";
import { validateAndParseUrl, appendQueryParams } from "./url.js";
import { verifySsrfSafety } from "./ssrf.js";
import {
  parseProxyConfig,
  getEnvironmentProxy,
  shouldBypassProxy,
  CustomForwardHttpAgent,
  CustomTunnelHttpsAgent,
} from "./proxy.js";
import {
  validateHeader,
  sanitizeRedirectHeaders,
  redactHeadersForLogging,
  redactUrlForLogging,
} from "./security.js";
import {
  normalizeRetryOptions,
  calculateRetryDelay,
  isRetryableMethod,
  isRetryableStatusCode,
  isRetryableError,
} from "./retry.js";
import { RisuResponse } from "./response.js";
import type { ConnectionPool } from "./pool.js";
import type {
  ClientOptions,
  RequestOptions,
  FormDataField,
  CookieJarLike,
  TimeoutOptions,
} from "./types.js";

interface PreparedBody {
  stream: Readable;
  headers: Record<string, string>;
  length?: number;
}

function prepareMultipartBody(fields: FormDataField[]): PreparedBody {
  const boundary = `----RisuBoundary${crypto.randomBytes(16).toString("hex")}`;
  const chunks: Buffer[] = [];

  for (const field of fields) {
    let headerStr = `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"`;
    if (field.filename) {
      headerStr += `; filename="${field.filename}"`;
    }
    headerStr += "\r\n";

    if (field.contentType) {
      headerStr += `Content-Type: ${field.contentType}\r\n`;
    } else if (field.filename) {
      headerStr += "Content-Type: application/octet-stream\r\n";
    }
    headerStr += "\r\n";

    chunks.push(Buffer.from(headerStr, "utf8"));

    if (typeof field.value === "string") {
      chunks.push(Buffer.from(field.value, "utf8"));
    } else if (Buffer.isBuffer(field.value)) {
      chunks.push(field.value);
    } else if (field.value instanceof Uint8Array) {
      chunks.push(Buffer.from(field.value));
    }
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  const fullBuffer = Buffer.concat(chunks);

  return {
    stream: Readable.from(fullBuffer),
    length: fullBuffer.length,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(fullBuffer.length),
    },
  };
}

function prepareBody(options: RequestOptions): PreparedBody | null {
  if (options.json !== undefined) {
    const payload = JSON.stringify(options.json);
    const buf = Buffer.from(payload, "utf8");
    return {
      stream: Readable.from(buf),
      length: buf.length,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(buf.length),
      },
    };
  }

  if (options.form !== undefined) {
    let formString = "";
    if (typeof options.form === "string") {
      formString = options.form;
    } else {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(options.form)) {
        if (v !== undefined && v !== null) {
          search.append(k, String(v));
        }
      }
      formString = search.toString();
    }
    const buf = Buffer.from(formString, "utf8");
    return {
      stream: Readable.from(buf),
      length: buf.length,
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        "content-length": String(buf.length),
      },
    };
  }

  if (options.formData !== undefined) {
    let fieldList: FormDataField[] = [];
    if (Array.isArray(options.formData)) {
      fieldList = options.formData;
    } else {
      for (const [k, v] of Object.entries(options.formData)) {
        fieldList.push({ name: k, value: String(v) });
      }
    }
    return prepareMultipartBody(fieldList);
  }

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === "string") {
      const buf = Buffer.from(options.body, "utf8");
      return {
        stream: Readable.from(buf),
        length: buf.length,
        headers: {
          "content-length": String(buf.length),
        },
      };
    }

    if (Buffer.isBuffer(options.body)) {
      return {
        stream: Readable.from(options.body),
        length: options.body.length,
        headers: {
          "content-length": String(options.body.length),
        },
      };
    }

    if (options.body instanceof Uint8Array) {
      const buf = Buffer.from(options.body);
      return {
        stream: Readable.from(buf),
        length: buf.length,
        headers: {
          "content-length": String(buf.length),
        },
      };
    }

    if (options.body instanceof Readable) {
      return {
        stream: options.body,
        headers: {},
      };
    }
  }

  return null;
}

function parseTimeouts(
  clientTimeout?: ClientOptions["timeout"],
  reqTimeout?: RequestOptions["timeout"]
): TimeoutOptions {
  const resolved: TimeoutOptions = {};

  const apply = (input?: ClientOptions["timeout"]) => {
    if (input === undefined) {
      return;
    }
    if (typeof input === "number") {
      resolved.total = input;
    } else {
      if (input.connect !== undefined) resolved.connect = input.connect;
      if (input.read !== undefined) resolved.read = input.read;
      if (input.total !== undefined) resolved.total = input.total;
    }
  };

  apply(clientTimeout);
  apply(reqTimeout);
  return resolved;
}

function normalizeHeadersInit(init?: ClientOptions["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!init) {
    return result;
  }

  if (init instanceof Map) {
    for (const [k, v] of init.entries()) {
      result[k.toLowerCase()] = String(v);
    }
    return result;
  }

  if (Array.isArray(init)) {
    for (const [k, v] of init) {
      result[k.toLowerCase()] = String(v);
    }
    return result;
  }

  for (const [k, v] of Object.entries(init)) {
    if (v !== undefined && v !== null) {
      result[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    }
  }

  return result;
}

export async function executeSingleHttpCall(
  currentUrl: URL,
  method: string,
  headers: Record<string, string>,
  body: PreparedBody | null,
  clientOptions: ClientOptions,
  requestOptions: RequestOptions,
  pool: ConnectionPool
): Promise<RisuResponse> {
  const timeouts = parseTimeouts(clientOptions.timeout, requestOptions.timeout);
  const enableSsrf = requestOptions.ssrfProtection ?? clientOptions.ssrfProtection ?? false;

  if (enableSsrf) {
    await verifySsrfSafety(currentUrl.hostname);
  }

  let proxyConfig =
    requestOptions.proxy === false
      ? null
      : parseProxyConfig(requestOptions.proxy ?? clientOptions.proxy);

  if (proxyConfig === null && requestOptions.proxy !== false) {
    proxyConfig = getEnvironmentProxy(currentUrl);
  }

  if (proxyConfig && shouldBypassProxy(currentUrl, proxyConfig.bypass)) {
    proxyConfig = null;
  }

  const isHttps = currentUrl.protocol === "https:";
  let agent: http.Agent | https.Agent;
  let requestPath = currentUrl.pathname + currentUrl.search;

  if (proxyConfig) {
    if (isHttps) {
      const customAgent = new CustomTunnelHttpsAgent(
        proxyConfig,
        requestOptions.tls ?? clientOptions.tls,
        { timeout: timeouts.connect }
      );
      pool.registerCustomAgent(customAgent);
      agent = customAgent;
    } else {
      const customAgent = new CustomForwardHttpAgent(proxyConfig, {
        timeout: timeouts.connect,
      });
      pool.registerCustomAgent(customAgent);
      agent = customAgent;
      const targetPort = currentUrl.port || 80;
      requestPath = `http://${currentUrl.hostname}:${targetPort}${requestPath}`;
      if (proxyConfig.auth) {
        const credentials = Buffer.from(
          `${proxyConfig.auth.username}:${proxyConfig.auth.password}`
        ).toString("base64");
        headers["proxy-authorization"] = `Basic ${credentials}`;
      }
    }
  } else {
    agent = pool.getAgent(currentUrl.protocol);
  }

  const transport = isHttps ? https : http;

  const nodeReqOptions: https.RequestOptions = {
    method,
    hostname: currentUrl.hostname,
    port: currentUrl.port || (isHttps ? 443 : 80),
    path: requestPath,
    headers,
    agent,
    ca: requestOptions.tls?.ca ?? clientOptions.tls?.ca,
    cert: requestOptions.tls?.cert ?? clientOptions.tls?.cert,
    key: requestOptions.tls?.key ?? clientOptions.tls?.key,
    rejectUnauthorized:
      requestOptions.tls?.rejectUnauthorized ??
      clientOptions.tls?.rejectUnauthorized ??
      true,
  };

  return new Promise<RisuResponse>((resolve, reject) => {
    let isSettled = false;
    let totalTimeoutTimer: NodeJS.Timeout | undefined;
    let connectTimeoutTimer: NodeJS.Timeout | undefined;
    let readTimeoutTimer: NodeJS.Timeout | undefined;

    const cleanupTimers = () => {
      if (totalTimeoutTimer) clearTimeout(totalTimeoutTimer);
      if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
      if (readTimeoutTimer) clearTimeout(readTimeoutTimer);
    };

    const abortHandler = () => {
      if (!isSettled) {
        isSettled = true;
        cleanupTimers();
        req.destroy(new RisuError("Request was aborted by caller", { url: currentUrl.toString(), method }));
        reject(new RisuError("Request was aborted by caller", { url: currentUrl.toString(), method }));
      }
    };

    if (requestOptions.signal) {
      if (requestOptions.signal.aborted) {
        reject(new RisuError("Request was aborted prior to execution", { url: currentUrl.toString(), method }));
        return;
      }
      requestOptions.signal.addEventListener("abort", abortHandler, { once: true });
    }

    if (timeouts.total && timeouts.total > 0) {
      totalTimeoutTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          cleanupTimers();
          req.destroy();
          reject(
            new TimeoutError(`Request exceeded total timeout of ${timeouts.total}ms`, {
              phase: "total",
              url: currentUrl.toString(),
              method,
            })
          );
        }
      }, timeouts.total);
    }

    const req = transport.request(nodeReqOptions, (incomingMsg) => {
      if (readTimeoutTimer) {
        clearTimeout(readTimeoutTimer);
      }

      if (isSettled) {
        incomingMsg.destroy();
        return;
      }

      cleanupTimers();
      isSettled = true;
      if (requestOptions.signal) {
        requestOptions.signal.removeEventListener("abort", abortHandler);
      }

      const rawHeaders = incomingMsg.rawHeaders;
      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(incomingMsg.headers)) {
        if (v !== undefined) {
          responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        }
      }

      const risuRes = new RisuResponse({
        statusCode: incomingMsg.statusCode ?? 0,
        statusText: incomingMsg.statusMessage ?? "",
        headers: responseHeaders,
        rawHeaders,
        url: currentUrl.toString(),
        rawStream: incomingMsg,
        maxResponseSize: requestOptions.maxResponseSize ?? clientOptions.maxResponseSize,
        decompress: requestOptions.decompress ?? true,
      });

      resolve(risuRes);
    });

    if (timeouts.connect && timeouts.connect > 0) {
      connectTimeoutTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          cleanupTimers();
          req.destroy();
          reject(
            new TimeoutError(`Connection timed out after ${timeouts.connect}ms`, {
              phase: "connect",
              url: currentUrl.toString(),
              method,
            })
          );
        }
      }, timeouts.connect);
    }

    req.on("socket", (socket) => {
      const onConnected = () => {
        if (connectTimeoutTimer) {
          clearTimeout(connectTimeoutTimer);
        }
      };

      if (socket.connecting) {
        socket.once("connect", onConnected);
      } else {
        onConnected();
      }

      if (timeouts.read && timeouts.read > 0) {
        req.setTimeout(timeouts.read, () => {
          if (!isSettled) {
            isSettled = true;
            cleanupTimers();
            req.destroy();
            reject(
              new TimeoutError(`Socket read timed out after ${timeouts.read}ms`, {
                phase: "read",
                url: currentUrl.toString(),
                method,
              })
            );
          }
        });
      }
    });

    req.on("error", (error) => {
      if (!isSettled) {
        isSettled = true;
        cleanupTimers();
        if (requestOptions.signal) {
          requestOptions.signal.removeEventListener("abort", abortHandler);
        }

        const classified = classifySystemError(error, {
          url: currentUrl.toString(),
          method,
        });
        reject(classified);
      }
    });

    if (body) {
      body.stream.on("error", (err) => {
        if (!isSettled) {
          isSettled = true;
          cleanupTimers();
          req.destroy(err);
          reject(err);
        }
      });
      body.stream.pipe(req);
    } else {
      req.end();
    }
  });
}

export async function executeRequestPipeline(
  urlInput: string,
  options: RequestOptions,
  clientOptions: ClientOptions,
  pool: ConnectionPool,
  cookieJar?: CookieJarLike
): Promise<RisuResponse> {
  const method = (options.method ?? "GET").toUpperCase();
  let currentUrl = validateAndParseUrl(urlInput, clientOptions.baseUrl);
  const queryParams = options.params ?? options.query;
  currentUrl = appendQueryParams(currentUrl, queryParams);

  const followRedirects = options.followRedirects ?? clientOptions.followRedirects ?? true;
  const maxRedirects = options.maxRedirects ?? clientOptions.maxRedirects ?? 10;
  const retryPolicy = normalizeRetryOptions(options.retries ?? clientOptions.retries);

  const mergedHeaders: Record<string, string> = {
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br",
    "user-agent": "risu-req/1.0.0",
    ...normalizeHeadersInit(clientOptions.headers),
    ...normalizeHeadersInit(options.headers),
  };

  const body = prepareBody(options);
  if (body) {
    for (const [k, v] of Object.entries(body.headers)) {
      if (!mergedHeaders[k.toLowerCase()]) {
        mergedHeaders[k.toLowerCase()] = v;
      }
    }
  }

  for (const [name, val] of Object.entries(mergedHeaders)) {
    validateHeader(name, val);
  }

  let attempt = 0;
  const maxRetries = retryPolicy?.maxRetries ?? 0;

  while (true) {
    attempt++;
    const startTime = Date.now();

    if (clientOptions.logging?.onRequest) {
      clientOptions.logging.onRequest({
        method,
        url: redactUrlForLogging(currentUrl),
        headers: redactHeadersForLogging(mergedHeaders),
        hasBody: body !== null,
      });
    }

    let redirectCount = 0;
    let activeUrl = new URL(currentUrl.toString());
    let activeHeaders = { ...mergedHeaders };
    let activeMethod = method;

    try {
      while (true) {
        if (cookieJar) {
          const cookieStr = cookieJar.getCookieString(activeUrl);
          if (cookieStr) {
            activeHeaders["cookie"] = cookieStr;
          }
        }

        const response = await executeSingleHttpCall(
          activeUrl,
          activeMethod,
          activeHeaders,
          activeMethod === method ? body : null,
          clientOptions,
          options,
          pool
        );

        if (cookieJar) {
          const setCookieHeaders = response.rawHeaders
            .map((header, index) => (index % 2 === 0 && header.toLowerCase() === "set-cookie" ? response.rawHeaders[index + 1] : null))
            .filter((val): val is string => val !== null);

          if (setCookieHeaders.length > 0) {
            cookieJar.setCookies(setCookieHeaders, activeUrl);
          }
        }

        const isRedirect =
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          response.headers["location"] !== undefined;

        if (followRedirects && isRedirect) {
          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new MaxRedirectsError(
              `Maximum redirect limit of ${maxRedirects} exceeded`,
              redirectCount,
              { url: activeUrl.toString(), method: activeMethod }
            );
          }

          const rawLocation = response.headers["location"]!;
          const nextUrl = validateAndParseUrl(rawLocation, activeUrl.toString());

          activeHeaders = sanitizeRedirectHeaders(activeHeaders, activeUrl, nextUrl);

          if (response.statusCode === 303 || ((response.statusCode === 301 || response.statusCode === 302) && activeMethod === "POST")) {
            activeMethod = "GET";
            delete activeHeaders["content-length"];
            delete activeHeaders["content-type"];
          }

          activeUrl = nextUrl;
          continue;
        }

        const durationMs = Date.now() - startTime;
        if (clientOptions.logging?.onResponse) {
          clientOptions.logging.onResponse({
            method: activeMethod,
            url: redactUrlForLogging(activeUrl),
            statusCode: response.statusCode,
            statusText: response.statusText,
            headers: redactHeadersForLogging(response.headers),
            durationMs,
          });
        }

        if (
          retryPolicy &&
          attempt <= maxRetries &&
          isRetryableMethod(method, retryPolicy) &&
          isRetryableStatusCode(response.statusCode, retryPolicy)
        ) {
          const delayMs = calculateRetryDelay(
            attempt,
            retryPolicy,
            response.headers["retry-after"]
          );

          if (clientOptions.logging?.onRetry) {
            clientOptions.logging.onRetry({
              method,
              url: redactUrlForLogging(currentUrl),
              attempt,
              maxRetries,
              delayMs,
              reason: `Status code ${response.statusCode}`,
            });
          }

          await new Promise((res) => setTimeout(res, delayMs));
          break;
        }

        return response;
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      if (clientOptions.logging?.onError && error instanceof Error) {
        clientOptions.logging.onError({
          method,
          url: redactUrlForLogging(currentUrl),
          error,
          durationMs,
        });
      }

      if (
        retryPolicy &&
        attempt <= maxRetries &&
        isRetryableMethod(method, retryPolicy) &&
        isRetryableError(error)
      ) {
        const delayMs = calculateRetryDelay(attempt, retryPolicy);

        if (clientOptions.logging?.onRetry) {
          clientOptions.logging.onRetry({
            method,
            url: redactUrlForLogging(currentUrl),
            attempt,
            maxRetries,
            delayMs,
            reason: error instanceof Error ? error.message : String(error),
          });
        }

        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      throw error;
    }
  }
}
