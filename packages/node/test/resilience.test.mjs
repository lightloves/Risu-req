import test from "node:test";
import assert from "node:assert/strict";
import {
  RisuClient,
  TimeoutError,
  ResponseSizeLimitError,
  MaxRedirectsError,
  RisuError,
} from "../dist/index.js";
import { createLocalTestServer } from "./server.mjs";

test("Resilience, retries, timeouts, cancellation, and resource limit tests", async (t) => {
  const local = await createLocalTestServer();
  t.after(async () => {
    await local.close();
  });

  await t.test("Request total timeout enforcement", async () => {
    const client = new RisuClient();
    await assert.rejects(
      async () => client.get(`${local.baseUrl}/slow?delay=500`, { timeout: 100 }),
      TimeoutError
    );
    await client.close();
  });

  await t.test("Cancellation via AbortSignal", async () => {
    const client = new RisuClient();
    const controller = new AbortController();

    setTimeout(() => {
      controller.abort();
    }, 50);

    await assert.rejects(
      async () => client.get(`${local.baseUrl}/slow?delay=500`, { signal: controller.signal }),
      (err) => err instanceof RisuError && err.message.includes("aborted")
    );
    await client.close();
  });

  await t.test("Pre-aborted AbortSignal rejection", async () => {
    const client = new RisuClient();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => client.get(`${local.baseUrl}/echo`, { signal: controller.signal }),
      (err) => err instanceof RisuError && err.message.includes("aborted")
    );
    await client.close();
  });

  await t.test("Response size limit enforcement", async () => {
    const client = new RisuClient();
    const res = await client.get(`${local.baseUrl}/large?size=50000`, {
      maxResponseSize: 10000,
    });

    await assert.rejects(
      async () => res.bytes(),
      ResponseSizeLimitError
    );
    await client.close();
  });

  await t.test("Automatic retries on transient 503 error", async () => {
    const client = new RisuClient();
    const uniqueKey = `key_${Date.now()}`;
    const res = await client.get(`${local.baseUrl}/flaky?key=${uniqueKey}`, {
      retries: { maxRetries: 3, backoffFactor: 0.05 },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.recovered, true);
    assert.strictEqual(data.attempts, 3);
    await client.close();
  });

  await t.test("Redirect loop triggers MaxRedirectsError", async () => {
    const client = new RisuClient();
    await assert.rejects(
      async () => client.get(`${local.baseUrl}/redirect-loop`, { maxRedirects: 3 }),
      MaxRedirectsError
    );
    await client.close();
  });

  await t.test("Connection pool graceful shutdown", async () => {
    const client = new RisuClient();
    const res = await client.get(`${local.baseUrl}/echo`);
    assert.strictEqual(res.status, 200);
    await client.close();

    await assert.rejects(
      async () => client.get(`${local.baseUrl}/echo`),
      (err) => err instanceof Error && err.message.includes("closed")
    );
  });
});
