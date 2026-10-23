import test from "node:test";
import assert from "node:assert/strict";
import { CookieJar, RisuClient } from "../dist/index.js";
import { createLocalTestServer } from "./server.mjs";

test("Standards-compliant CookieJar unit and integration tests", async (t) => {
  await t.test("Host-only cookie matching", () => {
    const jar = new CookieJar();
    jar.setCookie("token=secret123; Path=/", "http://example.com/api");

    const matched = jar.getCookies("http://example.com/api");
    assert.strictEqual(matched.length, 1);
    assert.strictEqual(matched[0].name, "token");
    assert.strictEqual(matched[0].value, "secret123");

    const subdomainMatch = jar.getCookies("http://sub.example.com/api");
    assert.strictEqual(subdomainMatch.length, 0);

    const unrelatedMatch = jar.getCookies("http://other.org/api");
    assert.strictEqual(unrelatedMatch.length, 0);
  });

  await t.test("Domain attribute matching subdomains", () => {
    const jar = new CookieJar();
    jar.setCookie("shared=global_val; Domain=example.com; Path=/", "http://example.com");

    const rootMatch = jar.getCookies("http://example.com/dashboard");
    assert.strictEqual(rootMatch.length, 1);

    const subMatch = jar.getCookies("http://api.example.com/v1");
    assert.strictEqual(subMatch.length, 1);

    const unrelated = jar.getCookies("http://evil.com");
    assert.strictEqual(unrelated.length, 0);
  });

  await t.test("Public suffix cookie injection rejection", () => {
    const jar = new CookieJar();
    jar.setCookie("exploit=token; Domain=com; Path=/", "http://target.com");
    assert.strictEqual(jar.getCookies("http://target.com").length, 0);

    jar.setCookie("exploit=token; Domain=co.uk; Path=/", "http://target.co.uk");
    assert.strictEqual(jar.getCookies("http://target.co.uk").length, 0);
  });

  await t.test("Path matching precision", () => {
    const jar = new CookieJar();
    jar.setCookie("scoped=secret; Path=/app", "http://example.com");

    assert.strictEqual(jar.getCookies("http://example.com/app").length, 1);
    assert.strictEqual(jar.getCookies("http://example.com/app/dashboard").length, 1);
    assert.strictEqual(jar.getCookies("http://example.com/apple").length, 0);
    assert.strictEqual(jar.getCookies("http://example.com/").length, 0);
  });

  await t.test("Secure flag respects protocol", () => {
    const jar = new CookieJar();
    jar.setCookie("secure_only=safe; Secure; Path=/", "https://example.com");

    assert.strictEqual(jar.getCookies("https://example.com").length, 1);
    assert.strictEqual(jar.getCookies("http://example.com").length, 0);
  });

  await t.test("Expiration and Max-Age purging", () => {
    const jar = new CookieJar();
    jar.setCookie("expired=old; Max-Age=0; Path=/", "http://example.com");
    assert.strictEqual(jar.getCookies("http://example.com").length, 0);

    jar.setCookie("active=fresh; Max-Age=3600; Path=/", "http://example.com");
    assert.strictEqual(jar.getCookies("http://example.com").length, 1);
  });

  await t.test("Integration with RisuClient receiving and re-sending cookies", async () => {
    const local = await createLocalTestServer();
    const client = new RisuClient({ cookies: true });

    try {
      const initial = await client.get(`${local.baseUrl}/cookies`);
      const data1 = await initial.json();
      assert.strictEqual(data1.receivedCookie, "");

      const second = await client.get(`${local.baseUrl}/cookies`);
      const data2 = await second.json();
      assert.ok(data2.receivedCookie.includes("session_id=abc123xyz"));
      assert.ok(data2.receivedCookie.includes("theme=dark"));
    } finally {
      await client.close();
      await local.close();
    }
  });
});
