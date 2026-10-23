<div align="center">

# ⚡ risu-req

### One client. Two languages. Built for the real world.

A security-conscious HTTP client for **Node.js** and **Python**—with connection reuse, configurable retries, cookie management, redirect safeguards, and automatic response decompression.

[![npm version](https://img.shields.io/npm/v/risu-req?style=for-the-badge&color=cb3837&label=npm)](https://www.npmjs.com/package/risu-req)
[![PyPI version](https://img.shields.io/pypi/v/risu-req?style=for-the-badge&color=3775A9&label=PyPI)](https://pypi.org/project/risu-req/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-supported-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

**Reliable requests. Thoughtful engineering.**

</div>

---

## ✨ Why risu-req?

HTTP requests are easy to start—and harder to get right in production. `risu-req` brings useful networking controls into one approachable API, with implementations for two popular ecosystems.

| Capability | What it brings |
|---|---|
| **Dual-language API** | A familiar client-oriented approach in Node.js and Python |
| **Connection reuse** | Keep-alive connections and configurable pooling |
| **Resilient requests** | Retries with exponential backoff, jitter, and `Retry-After` support |
| **Explicit timeouts** | Configure connection, read, and total request limits |
| **Automatic decompression** | Gzip, Deflate, and Brotli response support |
| **Cookie management** | Persistent cookie handling with RFC 6265-oriented behavior |
| **Security controls** | TLS verification, SSRF defenses, safer redirects, and sensitive-data redaction |
| **Clean lifecycle** | Explicit client cleanup in Node.js and context-managed clients in Python |

> **Design goal:** make common HTTP workflows simple while keeping important networking behavior configurable.

## 🚀 Quick start

Choose your runtime and make your first request.

### Node.js · JavaScript · TypeScript

Install:

```bash
npm install risu-req
```

Make a request:

```javascript
import { get } from "risu-req";

const response = await get("https://httpbin.org/get", {
  params: { client: "risu-req" },
});

console.log(response.status);
console.log(await response.json());
```

### Reuse a client

Create one client when you want shared configuration, connection reuse, and cookie handling across requests.

```javascript
import { RisuClient } from "risu-req";

const client = new RisuClient({
  baseUrl: "https://httpbin.org",
  cookies: true,
  timeout: {
    connect: 3000,
    read: 10000,
    total: 15000,
  },
  retries: {
    maxRetries: 3,
    backoffFactor: 0.3,
  },
});

try {
  const response = await client.post("/post", {
    json: { message: "Hello, risu-req!" },
  });

  console.log(response.status, await response.json());
} finally {
  await client.close();
}
```

### Python · 3.10+

Install:

```bash
pip install risu-req
```

Make a request:

```python
import risu_req

response = risu_req.get(
    "https://httpbin.org/get",
    params={"client": "risu-req"},
)

print(response.status_code)
print(response.json())
```

### Reuse a client in Python

The context manager closes the client when the block exits.

```python
import risu_req

with risu_req.RisuClient(
    base_url="https://httpbin.org",
    cookies=True,
    timeout={
        "connect": 3.0,
        "read": 10.0,
        "total": 15.0,
    },
    retries={
        "max_retries": 3,
        "backoff_factor": 0.3,
    },
) as client:
    response = client.post(
        "/post",
        json={"message": "Hello, risu-req!"},
    )

    print(response.status_code)
    print(response.json())
```

## 🛡️ Security-minded by design

HTTP clients sit at the boundary between your application and external services. `risu-req` includes controls intended to make that boundary safer:

- **TLS verification** enabled by default.
- **SSRF defenses** for private, loopback, link-local, and reserved IPv4/IPv6 destinations.
- **Redirect safeguards** that strip sensitive headers across origins and prevent HTTPS-to-HTTP downgrades.
- **Cookie isolation** with RFC 6265-oriented handling.
- **Sensitive-data redaction** for credentials, cookies, and tokens in logs and traces.

Security behavior depends on runtime configuration and the implementation. Review the [Architecture & Security Specification](docs/architecture.md) and validate the controls against your own threat model before using the library in a sensitive environment.

## ⚙️ Built for resilient networking

### Retries that do more than repeat

Configure retry attempts, exponential backoff, randomized jitter, and server-provided `Retry-After` delays.

### Connection reuse

Keep-alive connections and configurable pooling help reduce the overhead of repeated requests.

### Timeouts with intent

Set separate limits for connecting, reading a response, and total request duration.

### Automatic response decoding

Handle Gzip, Deflate, and Brotli responses without adding decompression logic to every call site.

### Straightforward cleanup

Close persistent Node.js clients explicitly, or use Python's context manager to handle cleanup automatically.

## 📊 Benchmarks

The project benchmark report describes tests run under equivalent loopback conditions with connection reuse across 1,000 requests.

| Implementation | Throughput | Median latency | p95 latency |
|---|---:|---:|---:|
| Node.js · `risu-req` | 198.35 req/s | 48.00 ms | 62.20 ms |
| Python · `risu-req` | 19.55 req/s | 51.71 ms | — |
| Python · `urllib3.PoolManager` | 19.97 req/s | — | — |
| Python · `requests.Session` | 18.50 req/s | — | — |

These are reported results from the benchmark environment, **not universal performance guarantees**. Results vary with hardware, runtime versions, server behavior, connection reuse, and methodology. Review the [benchmark methodology](benchmarks/README.md) and reproduce the tests before drawing comparisons for your workload.

## 📚 Documentation

| Resource | Description |
|---|---|
| [Architecture & Security](docs/architecture.md) | Internal design, security controls, and threat model |
| [Node.js API Reference](docs/node-api.md) | Client configuration, methods, responses, and errors |
| [Python API Reference](docs/python-api.md) | Python interface, typing, and usage patterns |
| [Benchmarks](benchmarks/README.md) | Performance methodology and reproduction steps |
| [Security Policy](SECURITY.md) | How to report security vulnerabilities |
| [Contributing](CONTRIBUTING.md) | Development workflow and contribution guidelines |
| [Changelog](CHANGELOG.md) | Releases and notable changes |

## 🤝 Contributing

Contributions, bug reports, and thoughtful feedback are welcome.

1. Read the project documentation and architecture first.
2. Follow the workflow in [CONTRIBUTING.md](CONTRIBUTING.md).
3. Add tests for behavioral changes and security-sensitive fixes.
4. Document changes that affect public APIs or compatibility.

Please report security vulnerabilities using the process in [SECURITY.md](SECURITY.md), rather than posting sensitive details publicly.

## 📄 License

`risu-req` is distributed under the [MIT License](LICENSE).

---

<div align="center">

### ⚡ risu-req

**Reliable requests. Thoughtful engineering.**

Built for developers who care about what happens beyond the happy path.

</div>
