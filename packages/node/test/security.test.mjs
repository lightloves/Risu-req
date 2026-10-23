import test from "node:test";
import assert from "node:assert/strict";
import {
  RisuClient,
  ProtocolError,
  SsrfError,
  validateHeader,
  sanitizeRedirectHeaders,
  redactHeadersForLogging,
  redactUrlForLogging,
  isPrivateIp,
} from "../dist/index.js";
import { createLocalTestServer } from "./server.mjs";

test("Security validation, SSRF protection, and sensitive header stripping", async (t) => {
  await t.test("Rejection of non-HTTP protocols", async () => {
    const client = new RisuClient();
    await assert.rejects(
      async () => client.get("file:///etc/passwd"),
      ProtocolError
    );
    await assert.rejects(
      async () => client.get("ftp://example.com/test"),
      ProtocolError
    );
    await assert.rejects(
      async () => client.get("javascript:alert(1)"),
      ProtocolError
    );
    await client.close();
  });

  await t.test("Rejection of CRLF in URLs", async () => {
    const client = new RisuClient();
    await assert.rejects(
      async () => client.get("http://example.com/api\r\nInjected: true"),
      ProtocolError
    );
    await client.close();
  });

  await t.test("Header validation rejects CRLF and control characters", () => {
    assert.doesNotThrow(
      () => validateHeader("X-Good-Header", "fine-value")
    );

    assert.throws(
      () => validateHeader("Bad Header Name", "val"),
      ProtocolError
    );

    assert.throws(
      () => validateHeader("X-Inject", "val\r\nInjected: evil"),
      ProtocolError
    );
  });

  await t.test("SSRF private IP detection", () => {
    assert.strictEqual(isPrivateIp("127.0.0.1"), true);
    assert.strictEqual(isPrivateIp("10.0.0.1"), true);
    assert.strictEqual(isPrivateIp("172.16.0.5"), true);
    assert.strictEqual(isPrivateIp("172.31.255.255"), true);
    assert.strictEqual(isPrivateIp("192.168.1.100"), true);
    assert.strictEqual(isPrivateIp("169.254.169.254"), true);
    assert.strictEqual(isPrivateIp("::1"), true);
    assert.strictEqual(isPrivateIp("fc00::1"), true);
    assert.strictEqual(isPrivateIp("8.8.8.8"), false);
    assert.strictEqual(isPrivateIp("1.1.1.1"), false);
  });

  await t.test("SSRF protection blocks loopback requests when enabled", async () => {
    const client = new RisuClient({ ssrfProtection: true });
    await assert.rejects(
      async () => client.get("http://127.0.0.1:8080/test"),
      SsrfError
    );
    await assert.rejects(
      async () => client.get("http://localhost:8080/test"),
      SsrfError
    );
    await client.close();
  });

  await t.test("Sensitive header stripping on cross-origin redirects", () => {
    const originalHeaders = {
      authorization: "Bearer supersecrettoken",
      cookie: "session=123",
      "x-custom": "public-value",
    };

    const sameOriginHeaders = sanitizeRedirectHeaders(
      originalHeaders,
      new URL("http://example.com/start"),
      new URL("http://example.com/finish")
    );
    assert.strictEqual(sameOriginHeaders["authorization"], "Bearer supersecrettoken");
    assert.strictEqual(sameOriginHeaders["cookie"], "session=123");

    const crossOriginHeaders = sanitizeRedirectHeaders(
      originalHeaders,
      new URL("http://example.com/start"),
      new URL("http://other.org/finish")
    );
    assert.strictEqual(crossOriginHeaders["authorization"], undefined);
    assert.strictEqual(crossOriginHeaders["cookie"], undefined);
    assert.strictEqual(crossOriginHeaders["x-custom"], "public-value");
  });

  await t.test("Blocking insecure redirect downgrade from HTTPS to HTTP", () => {
    assert.throws(
      () =>
        sanitizeRedirectHeaders(
          {},
          new URL("https://secure.example.com/login"),
          new URL("http://insecure.example.com/dashboard"),
          false
        ),
      ProtocolError
    );
  });

  await t.test("Secret and token redaction for logging", () => {
    const headers = {
      Authorization: "Bearer secret-token",
      Cookie: "session=my-cookie",
      "X-Api-Key": "api-key-value",
      "Content-Type": "application/json",
    };
    const redacted = redactHeadersForLogging(headers);
    assert.strictEqual(redacted["Authorization"], "[REDACTED]");
    assert.strictEqual(redacted["Cookie"], "[REDACTED]");
    assert.strictEqual(redacted["X-Api-Key"], "[REDACTED]");
    assert.strictEqual(redacted["Content-Type"], "application/json");

    const urlWithSecret = "https://user:password@example.com/api?token=secret123&public=view";
    const redactedUrl = redactUrlForLogging(urlWithSecret);
    assert.ok(!redactedUrl.includes("password"));
    assert.ok(redactedUrl.includes("user:***@example.com"));
    assert.ok(!redactedUrl.includes("secret123"));
    assert.ok(redactedUrl.includes("token=***"));
    assert.ok(redactedUrl.includes("public=view"));
  });

  await t.test("Integration with safe redirect handling", async () => {
    const local = await createLocalTestServer();
    const client = new RisuClient();

    try {
      const res = await client.get(
        `${local.baseUrl}/redirect-start?target=${encodeURIComponent(`${local.baseUrl}/redirect-target`)}`
      );
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    } finally {
      await client.close();
      await local.close();
    }
  });
});
