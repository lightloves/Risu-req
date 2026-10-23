import test from "node:test";
import assert from "node:assert/strict";
import {
  RisuClient,
  ProxyError,
  shouldBypassProxy,
  parseProxyConfig,
} from "../dist/index.js";
import { createLocalTestServer, createLocalMockProxy } from "./server.mjs";

test("Proxy support, authentication, bypass rules, and tunnel error handling", async (t) => {
  const localTarget = await createLocalTestServer();
  const mockProxy = await createLocalMockProxy({ username: "proxyuser", password: "proxypassword" });

  t.after(async () => {
    await localTarget.close();
    await mockProxy.close();
  });

  await t.test("Proxy configuration parsing and redaction", () => {
    const config = parseProxyConfig("http://myuser:mypass@proxy.internal:8080");
    assert.ok(config);
    assert.strictEqual(config.url, "http://proxy.internal:8080");
    assert.strictEqual(config.auth?.username, "myuser");
    assert.strictEqual(config.auth?.password, "mypass");
  });

  await t.test("NO_PROXY bypass rule matching", () => {
    const bypassList = ["localhost", "127.0.0.1", "*.internal", ".corp.net", "192.168.1.1:8080"];

    assert.strictEqual(shouldBypassProxy(new URL("http://localhost/test"), bypassList), true);
    assert.strictEqual(shouldBypassProxy(new URL("http://127.0.0.1/test"), bypassList), true);
    assert.strictEqual(shouldBypassProxy(new URL("http://service.internal/test"), bypassList), true);
    assert.strictEqual(shouldBypassProxy(new URL("http://sub.corp.net/test"), bypassList), true);
    assert.strictEqual(shouldBypassProxy(new URL("http://192.168.1.1:8080/test"), bypassList), true);
    assert.strictEqual(shouldBypassProxy(new URL("http://192.168.1.1:9090/test"), bypassList), false);
    assert.strictEqual(shouldBypassProxy(new URL("http://example.com/test"), bypassList), false);
  });

  await t.test("Forwarding HTTP request through authenticated proxy", async () => {
    const client = new RisuClient({
      proxy: {
        url: mockProxy.proxyUrl,
        auth: { username: "proxyuser", password: "proxypassword" },
      },
    });

    const res = await client.get(`${localTarget.baseUrl}/echo`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.method, "GET");

    assert.ok(mockProxy.requests.length > 0);
    const lastReq = mockProxy.requests[mockProxy.requests.length - 1];
    assert.ok(lastReq.headers["proxy-authorization"]);

    await client.close();
  });

  await t.test("Proxy authentication failure returns 407", async () => {
    const client = new RisuClient({
      proxy: {
        url: mockProxy.proxyUrl,
        auth: { username: "wrong", password: "credentials" },
      },
    });

    const res = await client.get(`${localTarget.baseUrl}/echo`);
    assert.strictEqual(res.status, 407);
    await client.close();
  });

  await t.test("Unreachable proxy fails without silent direct fallback", async () => {
    const client = new RisuClient({
      proxy: "http://127.0.0.1:59999",
      timeout: 1000,
    });

    await assert.rejects(
      async () => client.get(`${localTarget.baseUrl}/echo`),
      (err) => err instanceof Error
    );
    await client.close();
  });
});
