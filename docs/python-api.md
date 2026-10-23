# risu-req Python API Reference

Complete documentation for the Python implementation of `risu-req`.

## Import

```python
import risu_req
from risu_req import RisuClient, CookieJar, RateLimitInfo, get, post, put, patch, delete, head, options
```

---

## Top-Level Convenience Methods

Convenience functions using the module-level client instance:

```python
response = risu_req.get("https://api.example.com/items", params={"page": 1})
print(response.status_code, response.json())
```

Available functions:
- `get(url, **kwargs)`
- `post(url, **kwargs)`
- `put(url, **kwargs)`
- `patch(url, **kwargs)`
- `delete(url, **kwargs)`
- `head(url, **kwargs)`
- `options(url, **kwargs)`
- `request(method, url, **kwargs)`

---

## `RisuClient` Class

Synchronous HTTP client managing underlying `urllib3` connection pools, cookie jars, and timeouts. Supports Python's `with` context manager for deterministic resource reclamation.

```python
with RisuClient(
    base_url="https://api.example.com",
    headers={"User-Agent": "my-app/1.0", "X-Api-Key": "secret"},
    timeout={"connect": 3.0, "read": 10.0, "total": 15.0},
    cookies=True,
    concurrency=10,
    proxy="http://user:pass@proxy.corp:8080",
    retries={"max_retries": 3, "backoff_factor": 0.3, "retry_after": True},
    pool={"max_connections": 64},
    ssrf_protection=True,
    max_response_size=10 * 1024 * 1024,
) as client:
    response = client.get("/profile")
    print(response.status_code, response.text)
```

### Methods
- `client.get(url, **kwargs)`
- `client.post(url, **kwargs)`
- `client.put(url, **kwargs)`
- `client.patch(url, **kwargs)`
- `client.delete(url, **kwargs)`
- `client.head(url, **kwargs)`
- `client.options(url, **kwargs)`
- `client.request(method, url, **kwargs)`
- `client.close()`: Clears pool managers and releases open sockets.

---

## Keyword Arguments (`kwargs`)

- `headers`: Dict of string header pairs.
- `params`: Dict of query parameters appended to the URL.
- `json`: Arbitrary Python object serialized to JSON (`Content-Type: application/json`).
- `form`: Dict encoded as urlencoded form data.
- `files`: Dict of files/fields sent as multipart form-data.
- `body`: Raw string or bytes payload.
- `timeout`: Float in seconds, or dict `{"connect": 3.0, "read": 10.0, "total": 15.0}`.
- `proxy`: Proxy URL string, dict `{"url": ..., "auth": {...}, "bypass": [...]}`, or `False` to bypass.
- `retries`: Boolean or dict `{"max_retries": 3, "backoff_factor": 0.3, ...}`.
- `max_response_size`: Maximum allowed incoming body bytes.
- `max_redirects`: Maximum allowed redirects (default: 10).
- `follow_redirects`: Boolean (default: True).
- `concurrency`: Optional integer bounding concurrent active requests through a Semaphore.
- `ssrf_protection`: Boolean enabling private IP check.
- `decompress`: Boolean enabling transparent gzip/deflate/brotli decoding (default: True).

---

## `RisuResponse` Class

Supports context manager (`with client.get(...) as resp:`):

- `status_code` / `status`: Integer status code.
- `reason` / `status_text`: String status message.
- `headers`: Case-insensitive header dictionary.
- `url`: Final effective URL string.
- `ok`: Boolean (`200 <= status_code < 300`).
- `json()`: Parses body text into Python data structure.
- `text`: Property returning UTF-8 string.
- `bytes()` / `content`: Method or property returning raw bytes.
- `stream(chunk_size=8192)`: Generator yielding decoded bytes chunks.
- `is_rate_limited`: Boolean indicating whether response was rate-limited (HTTP 429 or 503 with Retry-After).
- `retry_after`: Float delay in seconds parsed from `Retry-After` header (None if absent).
- `rate_limit`: `RateLimitInfo` dataclass containing parsed rate limit headers (`is_rate_limited`, `retry_after`, `limit`, `remaining`, `reset`, `reset_after`, `scope`).
- `diagnostics()`: Returns structured dictionary describing request outcome, authentication status, rate limits, and clear diagnostic cause.
- `close()` / `drain()`: Drains unread bytes from socket and releases connection back to keep-alive pool.
