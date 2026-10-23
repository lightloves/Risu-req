# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-23

### Added
- Independent Node.js and Python implementations with shared API design.
- Complete HTTP/1.1 engine supporting GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- Persistent connection pooling with keep-alive, per-host limits, and graceful shutdown.
- Standards-compliant RFC 6265 CookieJar supporting domain matching, path matching, expiry, Secure, HttpOnly, and SameSite.
- HTTP and HTTPS proxy support with CONNECT tunneling, proxy authentication, and NO_PROXY bypass rules.
- Defense-in-depth security: SSRF private network filtering, TLS verification, CRLF validation, sensitive header stripping on redirect, and logging redaction.
- Resilient retries with exponential backoff, randomized jitter, and Retry-After header parsing.
- Automatic decompression for gzip, deflate, and brotli.
- Streaming uploads and downloads with backpressure and response size limit enforcement.
- TypeScript definitions (`.d.ts`) and dual CommonJS/ESM distribution for Node.js.
- Clean wheel (`.whl`) and source tarball (`.tar.gz`) distribution for Python.
- Comprehensive automated test suites (80 tests passing across both packages).
- Reproducible performance benchmark suite.
