# risu-req Node.js API Reference

Complete documentation for the Node.js implementation of `risu-req`.

## Import

```typescript
// ESM
import { RisuClient, get, post, put, patch, del, head, options, CookieJar } from "risu-req";

// CommonJS
const { RisuClient, get, post, CookieJar } = require("risu-req");
```

---

## Top-Level Convenience Methods

Every standard HTTP verb is exposed as an async function using an internal global client instance:

```typescript
const res = await get("https://api.example.com/items", {
  params: { page: 1, limit: 20 },
  timeout: 5000,
});
```

Available functions:
- `get(url, options)`
- `post(url, options)`
- `put(url, options)`
- `patch(url, options)`
- `del(url, options)` / `delete(url, options)`
- `head(url, options)`
- `options(url, options)`
- `request(url, options)`

---

## `RisuClient` Class

Reusable HTTP client managing persistent connection pools, cookie jars, and base configurations.

```typescript
const client = new RisuClient({
  baseUrl: "https://api.example.com",
  headers: {
    "User-Agent": "my-app/1.0",
    "X-Api-Key": "secret",
  },
  timeout: {
    connect: 3000, // Socket connection timeout (ms)
    read: 10000,   // Socket inactivity read timeout (ms)
    total: 15000,  // Complete request-response timeout (ms)
  },
  cookies: true, // Enables default CookieJar
  concurrency: 10, // Max concurrent in-flight requests (Semaphore)
  proxy: "http://user:pass@proxy.corp:8080",
  retries: {
    maxRetries: 3,
    backoffFactor: 0.3,
    retryAfter: true,
  },
  pool: {
    maxSockets: 64,
    maxFreeSockets: 16,
    idleTimeout: 30000,
  },
  ssrfProtection: true,
  maxResponseSize: 10 * 1024 * 1024, // 10 MB limit
});
```

### Methods
- `client.get(url, options)`
- `client.post(url, options)`
- `client.put(url, options)`
- `client.patch(url, options)`
- `client.delete(url, options)` / `client.del(url, options)`
- `client.head(url, options)`
- `client.optionsMethod(url, options)`
- `client.request(url, options)`
- `client.close()`: Gracefully destroys active connection pools and release open sockets.

---

## Request Options (`RequestOptions`)

- `method`: HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`).
- `headers`: Headers object, array of tuples, or Map.
- `params` / `query`: Object or URLSearchParams appended to request URL.
- `json`: Data structure serialized as JSON (`Content-Type: application/json`).
- `form`: Form fields encoded as urlencoded body (`Content-Type: application/x-www-form-urlencoded`).
- `formData`: Array of `{ name, value, filename, contentType }` or key-value object sent as multipart form-data.
- `body`: Raw string, Buffer, Uint8Array, or Readable stream.
- `timeout`: Number in ms, or `{ connect, read, total }`.
- `proxy`: Proxy URL string, `{ url, auth, bypass }` object, or `false` to disable proxy.
- `retries`: Boolean or `{ maxRetries, backoffFactor, maxDelay, retryAfter, statusCodes, retryMethods }`.
- `signal`: Standard `AbortSignal` for cooperative cancellation.
- `maxResponseSize`: Byte limit for response body.
- `maxRedirects`: Maximum redirect hops (default: 10).
- `followRedirects`: Boolean (default: true).
- `concurrency`: Number bounding concurrent in-flight requests via semaphore queue.
- `ssrfProtection`: Boolean to block internal IP destinations.
- `decompress`: Boolean to automatically decompress gzip, deflate, and brotli (default: true).

---

## `RisuResponse` Class

- `statusCode` / `status`: HTTP status code (number).
- `statusText` / `reason`: HTTP status text (string).
- `headers`: Lowercase header map (`Record<string, string>`).
- `url`: Final effective URL after all redirect hops.
- `ok`: Boolean (`statusCode >= 200 && statusCode < 300`).
- `json<T>()`: Promise parsing response body as JSON.
- `text()`: Promise resolving response body as UTF-8 string.
- `bytes()` / `buffer()`: Promise resolving raw response body as `Buffer`.
- `stream()`: Returns `Readable` stream with backpressure and size limits applied.
- `isRateLimited`: Boolean indicating whether response was rate-limited (HTTP 429 or 503 with Retry-After).
- `retryAfter`: Number delay in seconds parsed from `Retry-After` header (null if absent).
- `rateLimit`: Object containing parsed rate limit headers (`isRateLimited`, `retryAfter`, `limit`, `remaining`, `reset`, `resetAfter`, `scope`).
- `diagnostics()`: Returns structured diagnostics describing request outcome, authentication status, rate limits, and clear cause explanation.
- `drain()` / `close()`: Drains any unread stream data and releases keep-alive socket back to pool.
- `getHeader(name)`: Case-insensitive header lookup.
