import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
import type { Duplex } from "node:stream";
import { ProxyError } from "./errors.js";
import type { ProxyInput, ProxyOptions, TlsOptions } from "./types.js";

export function redactProxyUrl(urlOrConfig: string | ProxyOptions): string {
  const rawUrl = typeof urlOrConfig === "string" ? urlOrConfig : urlOrConfig.url;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "[redacted-proxy-url]";
  }
}

export function parseProxyConfig(proxy?: ProxyInput): ProxyOptions | null {
  if (!proxy) {
    return null;
  }
  if (typeof proxy === "string") {
    const parsed = new URL(proxy);
    const auth =
      parsed.username || parsed.password
        ? {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
          }
        : undefined;

    return {
      url: `${parsed.protocol}//${parsed.host}`,
      auth,
      bypass: [],
    };
  }

  return {
    url: proxy.url,
    auth: proxy.auth,
    bypass: proxy.bypass ?? [],
  };
}

export function getEnvironmentProxy(targetUrl: URL): ProxyOptions | null {
  const env = process.env;
  const isHttps = targetUrl.protocol === "https:";

  const rawNoProxy = env.NO_PROXY ?? env.no_proxy ?? "";
  const bypassList = rawNoProxy
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (shouldBypassProxy(targetUrl, bypassList)) {
    return null;
  }

  const proxyEnvString = isHttps
    ? (env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy)
    : (env.HTTP_PROXY ?? env.http_proxy ?? env.ALL_PROXY ?? env.all_proxy);

  if (!proxyEnvString) {
    return null;
  }

  const parsed = parseProxyConfig(proxyEnvString);
  if (!parsed) {
    return null;
  }

  parsed.bypass = bypassList;
  return parsed;
}

export function shouldBypassProxy(targetUrl: URL, bypassRules: string[] = []): boolean {
  if (bypassRules.length === 0) {
    return false;
  }

  const targetHost = targetUrl.hostname.toLowerCase();
  const targetPort = targetUrl.port || (targetUrl.protocol === "https:" ? "443" : "80");

  for (const rawRule of bypassRules) {
    const rule = rawRule.trim().toLowerCase();
    if (rule === "*") {
      return true;
    }

    if (rule.includes(":")) {
      const [ruleHost, rulePort] = rule.split(":");
      if (rulePort === targetPort && (targetHost === ruleHost || targetHost.endsWith("." + ruleHost))) {
        return true;
      }
    }

    if (rule.startsWith(".")) {
      if (targetHost.endsWith(rule) || targetHost === rule.slice(1)) {
        return true;
      }
    } else if (rule.startsWith("*.")) {
      if (targetHost.endsWith(rule.slice(1))) {
        return true;
      }
    } else {
      if (targetHost === rule || targetHost.endsWith("." + rule)) {
        return true;
      }
    }
  }

  return false;
}

export async function createHttpConnectTunnel(
  proxyOptions: ProxyOptions,
  targetHost: string,
  targetPort: number,
  timeoutMs: number = 10000
): Promise<net.Socket> {
  const proxyUrl = new URL(proxyOptions.url);
  const proxyPort = Number.parseInt(proxyUrl.port, 10) || (proxyUrl.protocol === "https:" ? 443 : 80);
  const proxyHostname = proxyUrl.hostname;

  return new Promise<net.Socket>((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (timer) {
        clearTimeout(timer);
      }
    };

    const isSecureProxy = proxyUrl.protocol === "https:";
    const rawSocket: net.Socket = isSecureProxy
      ? tls.connect({
          host: proxyHostname,
          port: proxyPort,
          servername: proxyHostname,
        })
      : net.connect({
          host: proxyHostname,
          port: proxyPort,
        });

    timer = setTimeout(() => {
      if (!finished) {
        cleanup();
        rawSocket.destroy();
        reject(
          new ProxyError(`Proxy CONNECT tunnel connection timeout after ${timeoutMs}ms`, {
            url: redactProxyUrl(proxyOptions),
          })
        );
      }
    }, timeoutMs);

    rawSocket.on("error", (error) => {
      if (!finished) {
        cleanup();
        reject(
          new ProxyError(`Failed to connect to proxy server: ${error.message}`, {
            cause: error,
            url: redactProxyUrl(proxyOptions),
          })
        );
      }
    });

    rawSocket.on("connect", () => {
      let authHeader = "";
      if (proxyOptions.auth) {
        const credentials = Buffer.from(
          `${proxyOptions.auth.username}:${proxyOptions.auth.password}`
        ).toString("base64");
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`;
      } else if (proxyUrl.username || proxyUrl.password) {
        const credentials = Buffer.from(
          `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`
        ).toString("base64");
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`;
      }

      const connectMessage =
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        `Proxy-Connection: Keep-Alive\r\n` +
        authHeader +
        `\r\n`;

      rawSocket.write(connectMessage);

      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("latin1");
        const headerEndIndex = buffer.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) {
          return;
        }

        rawSocket.off("data", onData);
        cleanup();

        const statusLine = buffer.slice(0, buffer.indexOf("\r\n"));
        const match = statusLine.match(/^HTTP\/1\.[01]\s+(\d\d\d)\s*(.*)$/i);

        if (!match) {
          rawSocket.destroy();
          reject(
            new ProxyError(`Invalid status line received from proxy: ${statusLine}`, {
              url: redactProxyUrl(proxyOptions),
            })
          );
          return;
        }

        const statusCode = Number.parseInt(match[1], 10);
        if (statusCode !== 200) {
          rawSocket.destroy();
          reject(
            new ProxyError(`Proxy CONNECT failed with status code ${statusCode} (${match[2]})`, {
              statusCode,
              url: redactProxyUrl(proxyOptions),
            })
          );
          return;
        }

        const remainingData = buffer.slice(headerEndIndex + 4);
        if (remainingData.length > 0) {
          rawSocket.unshift(Buffer.from(remainingData, "latin1"));
        }

        resolve(rawSocket);
      };

      rawSocket.on("data", onData);
    });
  });
}

export class CustomTunnelHttpsAgent extends https.Agent {
  private readonly proxyOptions: ProxyOptions;
  private readonly customTlsOptions?: TlsOptions;

  constructor(
    proxyOptions: ProxyOptions,
    customTlsOptions?: TlsOptions,
    agentOptions?: https.AgentOptions
  ) {
    super({
      keepAlive: true,
      ...agentOptions,
    });
    this.proxyOptions = proxyOptions;
    this.customTlsOptions = customTlsOptions;
  }

  override createConnection(
    options: https.RequestOptions,
    callback?: (err: Error | null, stream: Duplex) => void
  ): Duplex | null | undefined {
    const host = options.host || (typeof options.hostname === "string" ? options.hostname : "localhost");
    const port = Number(options.port) || 443;

    createHttpConnectTunnel(this.proxyOptions, host, port)
      .then((tunnelSocket) => {
        const tlsSocket = tls.connect({
          socket: tunnelSocket,
          host,
          port,
          servername: this.customTlsOptions?.servername || host,
          ca: this.customTlsOptions?.ca,
          cert: this.customTlsOptions?.cert,
          key: this.customTlsOptions?.key,
          rejectUnauthorized: this.customTlsOptions?.rejectUnauthorized ?? true,
        });

        tlsSocket.on("error", (error) => {
          callback?.(error, tlsSocket);
        });

        tlsSocket.on("secureConnect", () => {
          callback?.(null, tlsSocket);
        });
      })
      .catch((error) => {
        const err = error instanceof Error ? error : new ProxyError(String(error));
        callback?.(err, null as unknown as Duplex);
      });

    return undefined;
  }
}

export class CustomForwardHttpAgent extends http.Agent {
  private readonly proxyOptions: ProxyOptions;
  readonly options: http.AgentOptions;

  constructor(proxyOptions: ProxyOptions, agentOptions?: http.AgentOptions) {
    super({
      keepAlive: true,
      ...agentOptions,
    });
    this.options = { keepAlive: true, ...agentOptions };
    this.proxyOptions = proxyOptions;
  }

  override createConnection(
    _options: http.ClientRequestArgs,
    callback?: (err: Error | null, stream: Duplex) => void
  ): Duplex | null | undefined {
    const proxyUrl = new URL(this.proxyOptions.url);
    const proxyPort = Number.parseInt(proxyUrl.port, 10) || 80;
    const socket = net.connect({
      host: proxyUrl.hostname,
      port: proxyPort,
    });

    socket.on("error", (err) => {
      callback?.(err, socket);
    });

    socket.on("connect", () => {
      callback?.(null, socket);
    });

    return socket;
  }
}
