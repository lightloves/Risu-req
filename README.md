⚡ risu-req

One client. Two languages. Production-grade networking.

"risu-req" is a high-performance HTTP client library for Node.js and Python, engineered for reliability, security, and consistent developer experience.

Built for modern applications that demand more than basic HTTP requests, "risu-req" combines intelligent retries, connection pooling, strict redirect handling, secure cookie management, and transparent decompression into a unified, developer-friendly API.

""npm version" (https://img.shields.io/npm/v/risu-req?style=flat-square&color=cb3837&label=npm)" (https://www.npmjs.com/package/risu-req)
""PyPI version" (https://img.shields.io/pypi/v/risu-req?style=flat-square&color=3775A9&label=PyPI)" (https://pypi.org/project/risu-req/)
""License: MIT" (https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square)" (LICENSE)
""Node.js" (https://img.shields.io/badge/Node.js-zero%20runtime%20dependencies-339933?style=flat-square&logo=nodedotjs&logoColor=white)" (https://nodejs.org/)
""Python" (https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)" (https://www.python.org/)

---

✦ Built for the real world

Capability| What you get
Dual-language API| Consistent design and exception semantics across Node.js and Python
Secure by default| TLS verification, SSRF defenses, safe redirects, and sensitive-data redaction
Connection pooling| Persistent connections, keep-alive reuse, and configurable timeouts
Resilient requests| Exponential backoff, randomized jitter, and "Retry-After" support
Automatic decompression| Gzip, Deflate, and Brotli support
Minimal overhead| Zero external runtime dependencies in Node.js
Developer-first| Typed interfaces, intuitive configuration, and straightforward cleanup

🚀 Get started in seconds

Choose your ecosystem and make your first request.

Node.js · TypeScript · JavaScript

npm install risu-req

import { RisuClient, get } from "risu-req";

// A simple request
const response = await get("https://httpbin.org/get", {
  params: { client: "risu-req" },
});

console.log(response.status, await response.json());

Persistent client

Reuse connections and maintain cookies across requests with a single client instance.

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

Python · Python 3.10+

pip install risu-req

import risu_req

# A simple request
response = risu_req.get(
    "https://httpbin.org/get",
    params={"client": "risu-req"},
)

print(response.status_code, response.json())

Persistent client

A clean, context-managed API with connection pooling and configurable retries.

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

    print(response.status_code, response.json())

---

🛡️ Security is part of the design

HTTP clients operate at the boundary between your application and the outside world. "risu-req" is designed with that boundary in mind.

Security layer| Protection
TLS verification| Certificate verification enabled by default
SSRF prevention| Blocks private, loopback, link-local, and reserved IPv4/IPv6 destinations
Redirect security| Strips sensitive headers across origins and prevents HTTPS-to-HTTP downgrades
Cookie isolation| RFC 6265-oriented cookie handling to prevent cross-domain leakage
Sensitive-data redaction| Redacts credentials, cookies, and tokens from logs and traces

Security behavior should be validated against the documented threat model and supported runtime configurations. See the "Architecture & Security Specification" (docs/architecture.md) for implementation details.

---

⚙️ Reliability without the boilerplate

Network failures are inevitable. Your application shouldn't need to reinvent request recovery every time.

Intelligent retries

Configure retry attempts, exponential backoff, randomized jitter, and server-provided "Retry-After" delays.

Connection reuse

Keep-alive connections and configurable pooling help reduce the overhead of repeated requests.

Predictable timeouts

Control connection establishment, response reading, and total request duration independently.

Automatic content decoding

Handle Gzip, Deflate, and Brotli responses without adding decompression logic to every call site.

Consistent developer experience

Use a unified client design across two ecosystems, with language-appropriate response objects and documented exception behavior.

---

📊 Performance benchmarks

Measured under equivalent loopback conditions with connection reuse across 1,000 requests.

Implementation| Throughput| Median latency| p95 latency
Node.js · risu-req| 198.35 req/s| 48.00 ms| 62.20 ms
Python · risu-req| 19.55 req/s| 51.71 ms| —
Python · raw "urllib3.PoolManager"| 19.97 req/s| —| —
Python · "requests.Session"| 18.50 req/s| —| —

The Node.js implementation demonstrated lower p95 tail latency than native "fetch" in the reported test. The Python implementation performed approximately on par with raw "urllib3.PoolManager" and exceeded "requests.Session" throughput in the reported test.

«Benchmark responsibly: Results depend on hardware, runtime versions, server behavior, connection reuse, and test methodology. These figures represent the reported benchmark environment, not a universal performance guarantee.»

Reproduce the tests and review the methodology in ""benchmarks/README.md"" (benchmarks/README.md).

---

📚 Documentation

Everything you need to integrate, configure, and contribute to "risu-req".

Resource| Description
"Architecture & Security" (docs/architecture.md)| Internal design, security controls, and threat model
"Node.js API Reference" (docs/node-api.md)| Client configuration, methods, responses, and errors
"Python API Reference" (docs/python-api.md)| Python interface, typing, and usage patterns
"Benchmarks" (benchmarks/README.md)| Performance methodology and reproduction
"Security Policy" (SECURITY.md)| Security reporting and responsible disclosure
"Contributing" (CONTRIBUTING.md)| Development workflow and contribution guidelines
"Changelog" (CHANGELOG.md)| Releases and notable changes

---

🤝 Contributing

Great infrastructure gets better through careful engineering and community contributions.

1. Review the existing documentation and architecture.
2. Follow the project's contribution guidelines.
3. Include tests for behavioral changes and security-sensitive fixes.
4. Document changes that affect public APIs or compatibility.

See "CONTRIBUTING.md" (CONTRIBUTING.md) to get started.

For security vulnerabilities, follow the process outlined in "SECURITY.md" (SECURITY.md).

---

📄 License

Distributed under the MIT License. See ""LICENSE"" (LICENSE) for details.

---

<div align="center">risu-req

Reliable requests. Thoughtful engineering.

Built for developers who care about what happens beyond the happy path.

</div>