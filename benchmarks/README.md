# risu-req Performance Benchmarks

Reproducible benchmark harness comparing `risu-req` with established standard clients under equivalent networking and connection reuse conditions.

## Methodology

- **Server**: In-memory local HTTP server with persistent keep-alive connections on loopback interface (`127.0.0.1:8999`).
- **Workload**: Fast JSON round-trips (`/` returning 64-byte payload).
- **Node.js Benchmark**: 1,000 requests, concurrency level = 10. Compared against native Node.js `fetch()` with keepalive.
- **Python Benchmark**: 1,000 sequential requests. Compared against raw `urllib3.PoolManager` and `requests.Session`.
- **Metrics**: Total wall time (ms), Throughput (requests/sec), Median latency (p50 ms), Tail latency (p95 ms).

## Results Observed

### Node.js (Concurrency = 10, Total = 1,000)

| Client | Total (ms) | Throughput (req/s) | p50 (ms) | p95 (ms) |
|---|---|---|---|---|
| **risu-req (Node)** | 5,041.60 | 198.35 | 48.00 | 62.20 |
| **native fetch** | 5,015.52 | 199.38 | 48.73 | 71.43 |

*Observation*: `risu-req` achieves throughput comparable to native `fetch` while showing tighter tail latency distribution (p95 of 62.20ms vs 71.43ms).

### Python (Sequential, Total = 1,000)

| Client | Total (ms) | Throughput (req/s) | p50 (ms) | p95 (ms) |
|---|---|---|---|---|
| **risu-req (Python)** | 51,139.72 | 19.55 | 51.71 | 55.91 |
| **urllib3.PoolManager** | 50,077.37 | 19.97 | 49.93 | 52.95 |
| **requests.Session** | 54,047.29 | 18.50 | 52.83 | 63.17 |

*Observation*: `risu-req` maintains minimal overhead over raw `urllib3.PoolManager` (19.55 req/s vs 19.97 req/s) and outperforms `requests.Session` (18.50 req/s with 63.17ms p95).

## How to Reproduce

Execute the reproducible benchmark script:

```bash
./benchmarks/run_benchmarks.sh
```
