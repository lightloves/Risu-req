# risu-req

> Production-Grade, High-Performance HTTP Client Library for Node.js and Python.

`risu-req` is a dual-language networking client built from the ground up for resilience, strict RFC compliance, and production security. It provides zero-dependency high-throughput execution in Node.js and a robust, typed interface powered by `urllib3` in Python.

---

## Highlights

- **Dual-Language Consistency**: Unified API design and identical exception semantics between Node.js and Python.
- **Enterprise Security**:
  - TLS certificate verification enabled by default.
  - Built-in SSRF protection blocking private, loopback, link-local, and reserved IPv4/IPv6 networks.
  - Strict RFC 6265 cookie jar preventing cross-domain cookie leakage.
  - Automatic sensitive header stripping across cross-origin redirects.
  - Prevention of insecure HTTPS-to-HTTP redirect downgrades.
  - Automatic redaction of credentials, cookies, and tokens in logs and traces.
- **High-Performance Connection Pooling**: Keep-alive socket reuse, configurable idle timeouts, and concurrency controls.
- **Resilient Retries**: Configurable exponential backoff with randomized jitter and full support for the HTTP `Retry-After` header.
- **Transparent Decompression**: Automatic handling of Gzip, Deflate, and Brotli compression.
- **Zero Runtime Dependencies**: The Node.js package requires zero external runtime dependencies.

---

## Quick Start

### Node.js (TypeScript & JavaScript)

```bash
npm install risu-req
```

```typescript
import { RisuClient, get, post } from "risu-req";

// Quick one-liner
const response = await get("https://httpbin.org/get", {
  params: { client: "risu-req" },
});
console.log(response.status, await response.json());

// Persistent client with connection pooling and cookies
const client = new RisuClient({
  baseUrl: "https://httpbin.org",
  cookies: true,
  timeout: { connect: 3000, read: 10000, total: 15000 },
  retries: { maxRetries: 3, backoffFactor: 0.3 },
});

try {
  const res = await client.post("/post", {
    json: { message: "Hello, risu-req!" },
  });
  console.log(res.status, await res.json());
} finally {
  await client.close();
}
```

### Python (Python 3.10+)

```bash
pip install risu-req
```

```python
import risu_req

# Quick one-liner
response = risu_req.get("https://httpbin.org/get", params={"client": "risu-req"})
print(response.status_code, response.json())

# Persistent client with connection pooling and cookies
with risu_req.RisuClient(
    base_url="https://httpbin.org",
    cookies=True,
    timeout={"connect": 3.0, "read": 10.0, "total": 15.0},
    retries={"max_retries": 3, "backoff_factor": 0.3},
) as client:
    res = client.post("/post", json={"message": "Hello, risu-req!"})
    print(res.status_code, res.json())
```

---

## Performance

Measured under equivalent loopback conditions with connection reuse (1,000 requests):

- **Node.js**: 198.35 requests/sec with 48.00ms median latency and 62.20ms p95 tail latency (outperforming native `fetch` on tail latency).
- **Python**: 19.55 requests/sec with 51.71ms median latency, performing on par with raw `urllib3.PoolManager` (19.97 req/s) and exceeding `requests.Session` (18.50 req/s).

See [benchmarks/README.md](benchmarks/README.md) for full benchmark methodology and reproduction instructions.

---

## Documentation

- [Architecture & Security Specification](docs/architecture.md)
- [Node.js API Reference](docs/node-api.md)
- [Python API Reference](docs/python-api.md)
- [Security Policy](SECURITY.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

---

## License

MIT © [risu-req contributors](LICENSE)
