import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createLocalTestServer } from "./server.mjs";
import {
  RisuClient,
  get,
  post,
  put,
  patch,
  del,
  head,
  options,
} from "../dist/index.js";

test("HTTP verbs and method convenience functions", async (t) => {
  const local = await createLocalTestServer();
  t.after(async () => {
    await local.close();
  });

  await t.test("GET request via convenience function", async () => {
    const res = await get(`${local.baseUrl}/echo?query=risu`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.ok, true);
    const data = await res.json();
    assert.strictEqual(data.method, "GET");
    assert.strictEqual(data.url, "/echo?query=risu");
  });

  await t.test("POST request with JSON body", async () => {
    const res = await post(`${local.baseUrl}/json`, {
      json: { library: "risu-req", version: 1 },
    });
    assert.strictEqual(res.statusCode, 200);
    const data = await res.json();
    assert.deepStrictEqual(data.received, { library: "risu-req", version: 1 });
  });

  await t.test("PUT request with form urlencoded body", async () => {
    const client = new RisuClient();
    const res = await client.put(`${local.baseUrl}/echo`, {
      form: { username: "alice", role: "admin" },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.method, "PUT");
    assert.ok(data.headers["content-type"].includes("application/x-www-form-urlencoded"));
    assert.ok(data.body.includes("username=alice"));
    assert.ok(data.body.includes("role=admin"));
    await client.close();
  });

  await t.test("PATCH request with raw text body", async () => {
    const res = await patch(`${local.baseUrl}/echo`, {
      body: "raw patch payload text",
      headers: { "Content-Type": "text/plain" },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.method, "PATCH");
    assert.strictEqual(data.body, "raw patch payload text");
  });

  await t.test("DELETE request", async () => {
    const res = await del(`${local.baseUrl}/echo`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.method, "DELETE");
  });

  await t.test("HEAD request returns headers without body", async () => {
    const res = await head(`${local.baseUrl}/echo`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers["content-type"]);
  });

  await t.test("OPTIONS request returns allowed methods", async () => {
    const res = await options(`${local.baseUrl}/echo`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.method, "OPTIONS");
  });

  await t.test("Streaming upload via Readable stream", async () => {
    const stream = Readable.from(["chunk1", "chunk2", "chunk3"]);
    const res = await post(`${local.baseUrl}/echo`, {
      body: stream,
      headers: { "Content-Type": "text/plain" },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.body, "chunk1chunk2chunk3");
  });

  await t.test("Transparent GZIP decompression", async () => {
    const res = await get(`${local.baseUrl}/gzip`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "compressed gzip payload");
    assert.strictEqual(data.flag, true);
  });

  await t.test("Transparent Deflate decompression", async () => {
    const res = await get(`${local.baseUrl}/deflate`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "compressed deflate payload");
  });

  await t.test("Transparent Brotli decompression", async () => {
    const res = await get(`${local.baseUrl}/brotli`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, "compressed brotli payload");
  });

  await t.test("Multipart form data upload", async () => {
    const res = await post(`${local.baseUrl}/echo`, {
      formData: [
        { name: "title", value: "hello multipart" },
        { name: "file", value: Buffer.from("file contents binary"), filename: "test.txt", contentType: "text/plain" },
      ],
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.headers["content-type"].includes("multipart/form-data"));
    assert.ok(data.body.includes("name=\"title\""));
    assert.ok(data.body.includes("hello multipart"));
    assert.ok(data.body.includes("filename=\"test.txt\""));
  });
});
