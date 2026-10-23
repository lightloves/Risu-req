# risu-req Architecture & Technical Specification

`risu-req` is an enterprise-grade, high-performance HTTP client library designed for production environments across Node.js and Python. Both language implementations offer consistent semantics, predictable error hierarchies, robust connection management, and defense-in-depth security.

---

## Architectural Principles

1. **Dual-Ecosystem Consistency**: Node.js and Python implementations mirror each other's configuration parameters, convenience functions, response structures, and exception classifications.
2. **Zero Unnecessary Dependencies**: The Node.js library uses only Node built-in networking modules (`http`, `https`, `tls`, `net`, `stream`, `zlib`, `crypto`). The Python library leverages the battle-tested `urllib3` transport engine.
3. **Defense in Depth**:
   - TLS verification strictly enforced by default.
   - Comprehensive RFC 6265 cookie isolation preventing cross-domain leaks.
   - Built-in SSRF protection blocking loopback, link-local, carrier-grade NAT, private subnets, and reserved addresses.
   - Cross-origin sensitive header sanitization on redirects (`Authorization`, `Cookie`, `Proxy-Authorization`).
   - Hard denial on insecure redirect downgrades (HTTPS -> HTTP).
   - Sensitive credential and token redaction across structured logs and error traces.
4. **Resilience Engineering**:
   - Connection pooling with keep-alive reuse, per-host limits, and idle timeouts.
   - Configurable exponential backoff with full randomized jitter.
   - Strict adherence to standard `Retry-After` HTTP headers.
   - Fail-fast timeouts partitioned into connection, socket read, and total request timeouts.
   - Cooperative cancellation via `AbortSignal` in Node.js and cancellation tokens in Python.

---

## System Component Diagram

```
+-------------------------------------------------------------+
|                      User Application                       |
+-------------------------------------------------------------+
                               |
               +---------------+---------------+
               |                               |
       [ Node.js API ]                 [ Python API ]
       (RisuClient)                    (RisuClient)
               |                               |
+--------------v---------------+---------------+--------------+
|                    Common Feature Engine                    |
|                                                             |
|  * Request Validation (CRLF, Protocol, Header format)       |
|  * URL Normalization & Query String Serialization           |
|  * RFC 6265 CookieJar (Domain / Path / Secure / Expiry)     |
|  * SSRF Address Guard (IPv4 / IPv6 Private Address Filter)  |
|  * Proxy Manager (HTTP Forward, HTTPS CONNECT Tunnel, Auth) |
|  * Retry Controller (Exponential Backoff + Jitter)          |
|  * Redirect Handler (Cycle detection, Cross-origin strip)   |
|  * Response Streaming & Size Limit Enforcer                 |
+------------------------------+------------------------------+
               |                               |
+--------------v---------------+---------------+--------------+
|     Node.js Transport        |       Python Transport       |
|  * http.Agent / https.Agent  |  * urllib3.PoolManager       |
|  * tls.connect Socket Tunnel |  * urllib3.ProxyManager      |
|  * zlib Stream Decompressor  |  * gzip / zlib / brotli      |
+-------------------------------------------------------------+
```

---

## Error Classification Hierarchy

All errors derive from the base `RisuError` (`ERR_RISU_REQUEST`):

- `DnsError` (`ERR_RISU_DNS`): System-level name resolution failures (`ENOTFOUND`, `EAI_AGAIN`).
- `TlsError` (`ERR_RISU_TLS`): Certificate expiration, untrusted CA, hostname mismatch, handshake errors.
- `TimeoutError` (`ERR_RISU_TIMEOUT`): Connect timeout, socket read timeout, or total request timeout.
- `ConnectionError` (`ERR_RISU_CONNECTION`): Connection refused (`ECONNREFUSED`), socket reset (`ECONNRESET`), broken pipe.
- `ProtocolError` (`ERR_RISU_PROTOCOL`): Malformed response, invalid header characters, CRLF injection attempts.
- `MaxRedirectsError` (`ERR_RISU_MAX_REDIRECTS`): Redirect loop or exceeded hop threshold.
- `ResponseSizeLimitError` (`ERR_RISU_RESPONSE_SIZE`): Incoming payload exceeds maximum configured byte budget.
- `ProxyError` (`ERR_RISU_PROXY`): Proxy tunnel rejection, proxy authentication failure (407), unreachable proxy.
- `SsrfError` (`ERR_RISU_SSRF`): Hostname or IP resolved to forbidden private/internal network addresses.

---

## Cookie Security Model

The built-in `CookieJar` strictly enforces RFC 6265:
- **Host-Only Cookies**: Cookies set without an explicit `Domain` attribute are marked host-only and never transmitted to subdomains.
- **Domain Matching**: Domain cookies must be identical to or a valid suffix of the request host. Cross-origin domain injection (e.g. `evil.com` setting cookie for `target.com`) is rejected.
- **Path Matching**: Verified against hierarchical path components (`/app` matches `/app/v1`, not `/application`).
- **Secure Flag**: Enforces transmission strictly across TLS (`https:`) connections.
- **Expiration & Max-Age**: Millisecond-accurate timestamp comparisons; Max-Age takes precedence over Expires.

---

## Proxy & CONNECT Tunneling Architecture

1. **HTTP Target via HTTP Proxy**:
   - The client connects directly to the proxy port.
   - The request line contains the absolute target URI (`GET http://target.example/path HTTP/1.1`).
   - If configured, `Proxy-Authorization: Basic <base64>` is injected.

2. **HTTPS Target via HTTP/HTTPS Proxy (CONNECT Tunnel)**:
   - A raw socket connection is made to the proxy.
   - A `CONNECT target.example:443 HTTP/1.1` request is sent with credentials.
   - Once the proxy responds with `HTTP/1.1 200 Connection Established`, the client wraps the open socket in a TLS handshake (`tls.connect`) with SNI matching the target domain.
   - Insecure silent fallback to direct connections is strictly prevented. If the proxy fails, a `ProxyError` is immediately raised.

3. **Bypass Rules (`NO_PROXY`)**:
   - Supports wildcards (`*`), exact hostnames (`localhost`, `127.0.0.1`), domain suffixes (`.corp.internal`, `*.lan`), and specific ports (`example.com:8080`).
