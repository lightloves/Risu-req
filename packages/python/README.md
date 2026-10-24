# risureq — Python HTTP Client

<p align="center">
  <strong>Reliable requests. Thoughtful engineering.</strong><br>
  A Python HTTP client for connection pooling, cookies, proxies, retries, and safer request handling.
</p>

<p align="center">
  <a href="https://pypi.org/project/risureq/">
    <img alt="PyPI version" src="https://img.shields.io/pypi/v/risureq?style=for-the-badge&logo=pypi" />
  </a>
  <a href="https://pypi.org/project/risureq/">
    <img alt="PyPI downloads" src="https://img.shields.io/pypi/dm/risureq?style=for-the-badge&logo=pypi" />
  </a>
  <a href="https://pypi.org/project/risureq/">
    <img alt="Python versions" src="https://img.shields.io/pypi/pyversions/risureq?style=for-the-badge&logo=python" />
  </a>
  <a href="../../LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
  </a>
</p>

`risureq` is the Python distribution for the RisuReq HTTP client. It provides a straightforward API for making HTTP requests, with a reusable client for connection pooling and cookie persistence.

> **Package name:** `risureq`  
> **Python import name:** `risu_req`  
> **Python requirement:** 3.10 or newer

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Reusable client](#reusable-client)
- [Request methods](#request-methods)
- [Configuration](#configuration)
- [Features](#features)
- [Errors and retries](#errors-and-retries)
- [Development](#development)
- [License](#license)

## Installation

Install from PyPI:

```bash
python -m pip install risureq
```

For optional Brotli support, if the package's optional extra is available in the published release:

```bash
python -m pip install "risureq[brotli]"
```

## Quick start

```python
import risu_req

response = risu_req.get("https://httpbin.org/get")

print(response.status_code)
print(response.json())
```

Pass query parameters and headers as needed:

```python
import risu_req

response = risu_req.get(
    "https://httpbin.org/get",
    params={"client": "risureq"},
    headers={"User-Agent": "risureq-example/1.0"},
    timeout=10.0,
)

print(response.status_code)
print(response.json())
```

## Reusable client

Use `RisuClient` when you want to reuse client configuration and connections across requests.

```python
import risu_req

with risu_req.RisuClient(
    base_url="https://httpbin.org",
    cookies=True,
    timeout=10.0,
) as client:
    first = client.get("/get", params={"request": "first"})
    second = client.get("/get", params={"request": "second"})

    print(first.status_code, first.json())
    print(second.status_code, second.json())
```

Using a context manager closes the client when the block ends.

## Request methods

The package exposes convenience functions for common HTTP methods:

```python
import risu_req

response = risu_req.post(
    "https://httpbin.org/post",
    json={"message": "Hello, risureq!"},
    headers={"User-Agent": "risureq-example/1.0"},
)

print(response.status_code)
print(response.json())
```

Available convenience methods include `get`, `post`, `put`, `patch`, `delete`, `head`, and `options`, alongside the general `request` function. Check the installed package's API for supported arguments and return types.

## Configuration

Depending on the API and options supported by the installed version, configuration can include:

- **Timeouts** for connection and response waiting.
- **Cookies** for maintaining state between requests.
- **Proxies** for routing requests through configured proxy servers.
- **Retries** for eligible transient failures.
- **Connection pooling** for reusing connections.
- **Response limits** to bound response-body consumption.
- **Redirect handling** to control redirect behavior.

Consult the source and API documentation for exact option names, defaults, and security behavior. Do not assume a security control is enabled unless the installed version's configuration and documentation confirm it.

## Features

- Simple convenience functions and a reusable `RisuClient`.
- Connection pooling and cookie-jar support.
- Proxy configuration.
- Configurable retry behavior.
- Request timeout and response-size controls.
- Structured response objects and library-specific exceptions.
- Response decompression support, depending on installed optional dependencies and server encoding.

Feature availability may vary by release and configuration.

## Errors and retries

Requests can fail because of connection problems, timeouts, proxy errors, TLS issues, invalid URLs, or HTTP responses. Handle exceptions appropriate to the operation and your installed version. Retry only operations that are safe to repeat; retrying a request with side effects can cause duplicate actions.

## Development

From the repository root, enter the Python package directory:

```bash
cd packages/python
```

Install the package and test dependencies:

```bash
python -m pip install -e ".[test]"
```

Run the tests:

```bash
python -m pytest
```

Build the distribution:

```bash
python -m pip install build
python -m build
```

If a command differs from the project's current development setup, follow the repository's `pyproject.toml` and contribution instructions.

## License

MIT. See the repository's [`LICENSE`](../../LICENSE).
