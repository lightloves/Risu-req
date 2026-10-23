"""Benchmark comparing risu_req against urllib3 and requests under equivalent conditions."""

import sys
import time
from typing import Any, Dict, List
import requests
import urllib3
import risu_req


def measure_risu(target_url: str, total_requests: int) -> Dict[str, Any]:
    latencies: List[float] = []
    with risu_req.RisuClient(pool={"max_connections": 10}) as client:
        start = time.perf_counter()
        for _ in range(total_requests):
            t0 = time.perf_counter()
            res = client.get(target_url)
            _ = res.bytes()
            latencies.append((time.perf_counter() - t0) * 1000)
        total_time = time.perf_counter() - start

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.5)]
    p95 = latencies[int(len(latencies) * 0.95)]
    rps = total_requests / total_time
    return {
        "client": "risu-req (Python)",
        "total_ms": round(total_time * 1000, 2),
        "rps": round(rps, 2),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
    }


def measure_urllib3(target_url: str, total_requests: int) -> Dict[str, Any]:
    latencies: List[float] = []
    manager = urllib3.PoolManager(maxsize=10)
    start = time.perf_counter()
    for _ in range(total_requests):
        t0 = time.perf_counter()
        resp = manager.request("GET", target_url)
        _ = resp.data
        latencies.append((time.perf_counter() - t0) * 1000)
    total_time = time.perf_counter() - start
    manager.clear()

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.5)]
    p95 = latencies[int(len(latencies) * 0.95)]
    rps = total_requests / total_time
    return {
        "client": "urllib3.PoolManager",
        "total_ms": round(total_time * 1000, 2),
        "rps": round(rps, 2),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
    }


def measure_requests(target_url: str, total_requests: int) -> Dict[str, Any]:
    latencies: List[float] = []
    with requests.Session() as session:
        start = time.perf_counter()
        for _ in range(total_requests):
            t0 = time.perf_counter()
            r = session.get(target_url)
            _ = r.content
            latencies.append((time.perf_counter() - t0) * 1000)
        total_time = time.perf_counter() - start

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.5)]
    p95 = latencies[int(len(latencies) * 0.95)]
    rps = total_requests / total_time
    return {
        "client": "requests.Session",
        "total_ms": round(total_time * 1000, 2),
        "rps": round(rps, 2),
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
    }


def main() -> None:
    target_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8999"
    total_requests = 1000
    print(f"Running Python benchmark: {total_requests} sequential requests to {target_url}\n")

    r_risu = measure_risu(target_url, total_requests)
    r_urllib3 = measure_urllib3(target_url, total_requests)
    r_requests = measure_requests(target_url, total_requests)

    print(f"{'Client':<22} | {'Total (ms)':<10} | {'Req/sec':<10} | {'p50 (ms)':<8} | {'p95 (ms)':<8}")
    print("-" * 66)
    for r in [r_risu, r_urllib3, r_requests]:
        print(f"{r['client']:<22} | {r['total_ms']:<10} | {r['rps']:<10} | {r['p50_ms']:<8} | {r['p95_ms']:<8}")


if __name__ == "__main__":
    main()
