import { RisuClient } from "../packages/node/dist/index.js";

async function measureRisu(targetUrl, totalRequests, concurrency) {
  const client = new RisuClient({
    pool: { maxSockets: concurrency, maxFreeSockets: concurrency, keepAlive: true },
  });

  const latencies = [];
  const start = performance.now();

  let completed = 0;
  async function worker() {
    while (completed < totalRequests) {
      completed++;
      const reqStart = performance.now();
      const res = await client.get(targetUrl);
      await res.bytes();
      latencies.push(performance.now() - reqStart);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalMs = performance.now() - start;
  await client.close();

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const rps = (totalRequests / (totalMs / 1000)).toFixed(2);

  return { name: "risu-req (Node)", totalMs: totalMs.toFixed(2), rps, p50: p50.toFixed(2), p95: p95.toFixed(2) };
}

async function measureNativeFetch(targetUrl, totalRequests, concurrency) {
  const latencies = [];
  const start = performance.now();

  let completed = 0;
  async function worker() {
    while (completed < totalRequests) {
      completed++;
      const reqStart = performance.now();
      const res = await fetch(targetUrl, { keepalive: true });
      await res.arrayBuffer();
      latencies.push(performance.now() - reqStart);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const totalMs = performance.now() - start;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const rps = (totalRequests / (totalMs / 1000)).toFixed(2);

  return { name: "native fetch", totalMs: totalMs.toFixed(2), rps, p50: p50.toFixed(2), p95: p95.toFixed(2) };
}

async function main() {
  const targetUrl = process.argv[2] || "http://127.0.0.1:8999";
  const requests = 1000;
  const concurrency = 10;

  console.log(`Running Node benchmark: ${requests} requests, concurrency=${concurrency} to ${targetUrl}\n`);

  const risuResult = await measureRisu(targetUrl, requests, concurrency);
  const fetchResult = await measureNativeFetch(targetUrl, requests, concurrency);

  console.table([risuResult, fetchResult]);
}

main().catch(console.error);
