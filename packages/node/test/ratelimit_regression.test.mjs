import test from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";

const execFileAsync = promisify(execFile);
import {
  RisuClient,
  CookieJar,
  parseRateLimitHeaders,
  parseRetryAfter,
  calculateRetryDelay,
} from "../dist/index.js";

function createTestServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((res) => {
            server.closeAllConnections?.();
            server.close(res);
          }),
      });
    });
  });
}

// 1. Comparison with curl using identical authorized test requests
test("Identical authorized test request matches curl and does not trigger rate limits on redirect", async () => {
  let unauthenticatedHits = 0;
  let authenticatedHits = 0;

  const helper = await createTestServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/auth-redirect") {
      res.writeHead(302, {
        Location: `/api/resource`,
        "Content-Length": "0",
      });
      res.end();
      return;
    }

    if (url.pathname === "/api/resource") {
      const auth = req.headers["authorization"];
      if (!auth || auth !== "Bearer valid-token-123") {
        unauthenticatedHits++;
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "2",
          "X-RateLimit-Limit": "1",
          "X-RateLimit-Remaining": "0",
        });
        res.end(
          JSON.stringify({
            error: "rate_limit_exceeded",
            message: "Unauthenticated IP rate limit exceeded",
          })
        );
        return;
      }

      authenticatedHits++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "authorized_ok", data: 42 }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const targetUrl = `${helper.url}/auth-redirect`;

  try {
    // Run curl with identical authorized request
    const { stdout: curlOutput } = await execFileAsync(
      "curl",
      ["-s", "-L", "-H", "Authorization: Bearer valid-token-123", targetUrl],
      { encoding: "utf8" }
    );
    const curlJson = JSON.parse(curlOutput);
    assert.strictEqual(curlJson.status, "authorized_ok");

    // Run risu-req with identical authorized request
    const client = new RisuClient();
    const risuRes = await client.get(targetUrl, {
      headers: { Authorization: "Bearer valid-token-123" },
    });

    assert.strictEqual(risuRes.statusCode, 200);
    assert.strictEqual(risuRes.isRateLimited, false);
    const risuJson = await risuRes.json();
    assert.strictEqual(risuJson.status, "authorized_ok");

    // Compare response fixture between curl and risu-req
    assert.deepStrictEqual(risuJson, curlJson);
    assert.strictEqual(unauthenticatedHits, 0, "No unauthenticated 429 requests should have occurred");

    await client.close();
  } finally {
    await helper.close();
  }
});

// 2. Rate-limit status and response-header detection, including Retry-After
test("Accurate rate-limit status and header detection with clear diagnostics", async () => {
  const helper = await createTestServer((req, res) => {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": "15",
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1700000000",
      "X-RateLimit-Reset-After": "15",
    });
    res.end(JSON.stringify({ error: "too_many_requests" }));
  });

  try {
    const client = new RisuClient();
    const res = await client.get(`${helper.url}/test-rl`);

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.isRateLimited, true);
    assert.strictEqual(res.retryAfter, 15);

    const rl = res.rateLimit;
    assert.ok(rl);
    assert.strictEqual(rl.isRateLimited, true);
    assert.strictEqual(rl.retryAfter, 15);
    assert.strictEqual(rl.limit, 100);
    assert.strictEqual(rl.remaining, 0);
    assert.strictEqual(rl.reset, 1700000000);
    assert.strictEqual(rl.resetAfter, 15);

    const diag = res.diagnostics();
    assert.strictEqual(diag.statusCode, 429);
    assert.strictEqual(diag.isRateLimited, true);
    assert.ok(diag.cause.includes("Rate limit"));
    assert.ok(diag.cause.includes("15s"));

    res.close();
    await client.close();
  } finally {
    await helper.close();
  }
});

// 3. HTTP-date parsing for Retry-After
test("Parse HTTP-date format in Retry-After header", () => {
  const futureDate = new Date(Date.now() + 60000).toUTCString();
  const ms = parseRetryAfter(futureDate);
  assert.ok(ms !== null && ms > 50000 && ms <= 65000);

  const secondsMs = parseRetryAfter("2.5");
  assert.strictEqual(secondsMs, 2500);
});

// 4. Bounded exponential backoff with jitter and retry limits
test("Bounded exponential backoff with jitter and retry limits", async () => {
  let attempts = 0;
  const helper = await createTestServer((req, res) => {
    attempts++;
    if (attempts < 3) {
      res.writeHead(429, {
        "Content-Type": "text/plain",
        "Retry-After": "0.02",
      });
      res.end("Rate limited");
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, attempts }));
    }
  });

  try {
    const retryLogs = [];
    const client = new RisuClient({
      retries: {
        maxRetries: 3,
        backoffFactor: 0.02,
        maxDelay: 500,
        retryAfter: true,
      },
      logging: {
        onRetry: (info) => retryLogs.push(info),
      },
    });

    const res = await client.get(`${helper.url}/flaky-rl`);
    assert.strictEqual(res.statusCode, 200);
    const json = await res.json();
    assert.strictEqual(json.attempts, 3);
    assert.strictEqual(retryLogs.length, 2);
    assert.strictEqual(retryLogs[0].attempt, 1);
    assert.strictEqual(retryLogs[1].attempt, 2);

    await client.close();
  } finally {
    await helper.close();
  }
});

// 5. Connection lifecycle management & keep-alive connection reuse
test("Connection lifecycle: keep-alive sockets reused across requests even with unread bodies", async () => {
  const sockets = new Set();
  const helper = await createTestServer((req, res) => {
    sockets.add(req.socket.remotePort);
    res.writeHead(429, {
      "Content-Type": "text/plain",
      "Content-Length": "12",
      Connection: "keep-alive",
    });
    res.end("rate limited");
  });

  try {
    const client = new RisuClient({
      pool: { keepAlive: true, maxSockets: 5 },
    });

    // Request 1: 429 received, body NOT read
    const r1 = await client.get(`${helper.url}/1`);
    assert.strictEqual(r1.statusCode, 429);
    await r1.close();

    // Request 2: should reuse the same socket
    const r2 = await client.get(`${helper.url}/2`);
    assert.strictEqual(r2.statusCode, 429);
    await r2.close();

    assert.strictEqual(sockets.size, 1, "Expected keep-alive socket to be reused across requests");
    await client.close();
  } finally {
    await helper.close();
  }
});

// 6. Prevention of accidental duplicate requests on non-idempotent methods
test("Prevention of accidental duplicate requests on non-idempotent methods", async () => {
  let postAttempts = 0;
  const helper = await createTestServer((req, res) => {
    postAttempts++;
    res.writeHead(429, {
      "Content-Type": "text/plain",
      "Retry-After": "0.01",
    });
    res.end("Rate limit");
  });

  try {
    const client = new RisuClient({
      retries: { maxRetries: 3, backoffFactor: 0.05 },
    });

    // POST should NOT be retried by default even if 429
    const res = await client.post(`${helper.url}/charge`, {
      json: { amount: 100 },
    });

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(postAttempts, 1, "Non-idempotent POST must not be retried automatically");

    res.close();
    await client.close();
  } finally {
    await helper.close();
  }
});

// 7. Non-replayable body stream should not be retried
test("Non-replayable body stream does not cause duplicate corrupt retries", async () => {
  let streamAttempts = 0;
  const helper = await createTestServer((req, res) => {
    streamAttempts++;
    req.resume(); // consume incoming body
    res.writeHead(503, { "Retry-After": "0.01" });
    res.end();
  });

  try {
    const client = new RisuClient({
      retries: { maxRetries: 3 },
    });

    const bodyStream = Readable.from(["part1", "part2"]);
    const res = await client.put(`${helper.url}/stream-upload`, {
      body: bodyStream,
    });

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(streamAttempts, 1, "Streaming body must not be retried");

    res.close();
    await client.close();
  } finally {
    await helper.close();
  }
});

// 8. Redirect cycle detection
test("Redirect loop triggers immediate cycle detection", async () => {
  const helper = await createTestServer((req, res) => {
    if (req.url === "/cycle-a") {
      res.writeHead(302, { Location: "/cycle-b" });
      res.end();
    } else {
      res.writeHead(302, { Location: "/cycle-a" });
      res.end();
    }
  });

  try {
    const client = new RisuClient();
    await assert.rejects(
      async () => {
        await client.get(`${helper.url}/cycle-a`);
      },
      {
        name: "MaxRedirectsError",
      }
    );
    await client.close();
  } finally {
    await helper.close();
  }
});

// 9. Configurable concurrency limits
test("Configurable concurrency limits throttle simultaneous requests", async () => {
  let activeConcurrent = 0;
  let maxSeenConcurrent = 0;

  const helper = await createTestServer((req, res) => {
    activeConcurrent++;
    if (activeConcurrent > maxSeenConcurrent) {
      maxSeenConcurrent = activeConcurrent;
    }
    setTimeout(() => {
      activeConcurrent--;
      res.writeHead(200);
      res.end("ok");
    }, 40);
  });

  try {
    const client = new RisuClient({ concurrency: 2 });
    const reqs = Array.from({ length: 6 }, () =>
      client.get(`${helper.url}/conc`).then((r) => r.text())
    );

    await Promise.all(reqs);
    assert.strictEqual(maxSeenConcurrent, 2, "Active concurrency must not exceed configured limit of 2");

    await client.close();
  } finally {
    await helper.close();
  }
});

// 10. Accurate logging with secrets redacted
test("Secrets and authorization tokens are redacted in request and response logs", async () => {
  let loggedRequest = null;
  let loggedResponse = null;

  const helper = await createTestServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Set-Cookie": "session_token=secret_val; Path=/",
    });
    res.end("ok");
  });

  try {
    const client = new RisuClient({
      logging: {
        onRequest: (info) => {
          loggedRequest = info;
        },
        onResponse: (info) => {
          loggedResponse = info;
        },
      },
    });

    const res = await client.get(
      `http://user:password123@127.0.0.1:${helper.port}/secret?token=mytoken&key=secretkey`,
      {
        headers: {
          Authorization: "Bearer super-secret-jwt",
          "X-Api-Key": "apikey-12345",
          Cookie: "cookie_id=cookie123",
        },
      }
    );
    await res.text();

    assert.ok(loggedRequest);
    assert.strictEqual(loggedRequest.headers["authorization"], "[REDACTED]");
    assert.strictEqual(loggedRequest.headers["x-api-key"], "[REDACTED]");
    assert.strictEqual(loggedRequest.headers["cookie"], "[REDACTED]");
    assert.ok(!loggedRequest.url.includes("password123"));
    assert.ok(!loggedRequest.url.includes("mytoken"));
    assert.ok(!loggedRequest.url.includes("secretkey"));

    assert.ok(loggedResponse);
    assert.strictEqual(loggedResponse.headers["set-cookie"], "[REDACTED]");

    await client.close();
  } finally {
    await helper.close();
  }
});
