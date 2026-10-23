import * as http from "node:http";
import * as net from "node:net";
import * as zlib from "node:zlib";

export function createLocalTestServer() {
  const retryAttempts = new Map();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/echo") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const bodyBuf = Buffer.concat(chunks);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            method: req.method,
            headers: req.headers,
            url: req.url,
            body: bodyBuf.toString("utf8"),
          })
        );
      });
      return;
    }

    if (url.pathname === "/json") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const bodyStr = Buffer.concat(chunks).toString("utf8");
        const parsed = bodyStr ? JSON.parse(bodyStr) : null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: parsed }));
      });
      return;
    }

    if (url.pathname === "/cookies") {
      const cookieHeader = req.headers.cookie || "";
      res.writeHead(200, [
        ["Content-Type", "application/json"],
        ["Set-Cookie", "session_id=abc123xyz; Path=/; HttpOnly"],
        ["Set-Cookie", "theme=dark; Path=/; Domain=127.0.0.1"],
      ]);
      res.end(JSON.stringify({ receivedCookie: cookieHeader }));
      return;
    }

    if (url.pathname === "/redirect-start") {
      const target = url.searchParams.get("target") || "/redirect-target";
      const status = Number.parseInt(url.searchParams.get("status") || "302", 10);
      res.writeHead(status, { Location: target });
      res.end();
      return;
    }

    if (url.pathname === "/redirect-target") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          method: req.method,
          headers: req.headers,
        })
      );
      return;
    }

    if (url.pathname === "/redirect-loop") {
      res.writeHead(302, { Location: "/redirect-loop" });
      res.end();
      return;
    }

    if (url.pathname === "/slow") {
      const delay = Number.parseInt(url.searchParams.get("delay") || "2000", 10);
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("slow response completed");
      }, delay);
      return;
    }

    if (url.pathname === "/flaky") {
      const key = url.searchParams.get("key") || "default";
      const count = (retryAttempts.get(key) || 0) + 1;
      retryAttempts.set(key, count);

      if (count < 3) {
        res.writeHead(503, {
          "Content-Type": "text/plain",
          "Retry-After": "0",
        });
        res.end("service unavailable transient error");
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ attempts: count, recovered: true }));
      }
      return;
    }

    if (url.pathname === "/gzip") {
      const payload = JSON.stringify({ message: "compressed gzip payload", flag: true });
      const compressed = zlib.gzipSync(Buffer.from(payload, "utf8"));
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      });
      res.end(compressed);
      return;
    }

    if (url.pathname === "/deflate") {
      const payload = JSON.stringify({ message: "compressed deflate payload" });
      const compressed = zlib.deflateSync(Buffer.from(payload, "utf8"));
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "deflate",
      });
      res.end(compressed);
      return;
    }

    if (url.pathname === "/brotli") {
      const payload = JSON.stringify({ message: "compressed brotli payload" });
      const compressed = zlib.brotliCompressSync(Buffer.from(payload, "utf8"));
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "br",
      });
      res.end(compressed);
      return;
    }

    if (url.pathname === "/large") {
      const bytesCount = Number.parseInt(url.searchParams.get("size") || "1048576", 10);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytesCount),
      });
      const chunk = Buffer.alloc(8192, 0x41);
      let sent = 0;
      const sendMore = () => {
        while (sent < bytesCount) {
          const remaining = bytesCount - sent;
          const toSend = remaining > chunk.length ? chunk : chunk.subarray(0, remaining);
          sent += toSend.length;
          const canContinue = res.write(toSend);
          if (!canContinue) {
            res.once("drain", sendMore);
            return;
          }
        }
        res.end();
      };
      sendMore();
      return;
    }

    if (url.pathname === "/truncated") {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Length": "1000",
      });
      res.write("short body");
      res.destroy();
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

export function createLocalMockProxy(expectedAuth) {
  const requests = [];

  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
    });

    if (expectedAuth) {
      const authHeader = req.headers["proxy-authorization"];
      const expectedBasic = `Basic ${Buffer.from(`${expectedAuth.username}:${expectedAuth.password}`).toString("base64")}`;
      if (authHeader !== expectedBasic) {
        res.writeHead(407, {
          "Proxy-Authenticate": 'Basic realm="Test Proxy"',
          "Content-Type": "text/plain",
        });
        res.end("Proxy authentication required");
        return;
      }
    }

    const targetUrl = new URL(req.url);
    const connector = http.request(
      {
        host: targetUrl.hostname,
        port: targetUrl.port || 80,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );

    req.pipe(connector);
  });

  server.on("connect", (req, clientSocket, head) => {
    requests.push({
      method: "CONNECT",
      url: req.url,
      headers: req.headers,
    });

    if (expectedAuth) {
      const authHeader = req.headers["proxy-authorization"];
      const expectedBasic = `Basic ${Buffer.from(`${expectedAuth.username}:${expectedAuth.password}`).toString("base64")}`;
      if (authHeader !== expectedBasic) {
        clientSocket.write("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
        clientSocket.destroy();
        return;
      }
    }

    const [targetHost, targetPortStr] = req.url.split(":");
    const targetPort = Number.parseInt(targetPortStr, 10) || 443;

    const serverSocket = net.connect(targetPort, targetHost, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length > 0) {
        serverSocket.write(head);
      }
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on("error", () => {
      clientSocket.destroy();
    });
    clientSocket.on("error", () => {
      serverSocket.destroy();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        proxyUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}
