# risureq

[![npm version](https://img.shields.io/npm/v/risureq)](https://www.npmjs.com/package/risureq)
[![Python](https://img.shields.io/pypi/v/risureq)](https://pypi.org/project/risureq/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**risureq** is an HTTP client project with implementations for **Node.js** and **Python**. It provides a consistent place to work with HTTP requests, headers, cookies, proxies, sessions, and response handling.

> The npm package is `risureq`. The Python package is intended to use the same name, `risureq`; update `packages/python/pyproject.toml` and its package metadata before publishing that name to PyPI.

## Implementations

| Implementation | Package | Requirements | Installation |
|---|---|---|---|
| Node.js | [`risureq` on npm](https://www.npmjs.com/package/risureq) | Node.js 18+ | `npm install risureq` |
| Python | [`risureq` on PyPI](https://pypi.org/project/risureq/) | Python 3.10+ | `pip install risureq` |

## Features

- Custom request headers
- Cookie handling and persistent sessions
- Proxy configuration
- Connection reuse and pooling
- Common HTTP methods
- Structured responses and error handling
- Retry support
- Brotli decoding support where configured
- TypeScript declarations for the Node.js package
- Python package with optional extras for Brotli support

Feature availability and configuration can differ between the Node.js and Python implementations. See each implementation's README for details.

## Node.js

### Install

```bash
npm install risureq
```

### Quick start

```javascript
import { get, request, RisuClient } from "risureq";

// Simple GET request
const response = await get("https://httpbin.org/get");
console.log(response.status);
console.log(response.data);

// Generic request
const result = await request("https://httpbin.org/headers", {
  method: "GET",
  headers: {
    "User-Agent": "risureq-example"
  }
});
console.log(result.status);
```

### Persistent client

```javascript
import { RisuClient } from "risureq";

const client = new RisuClient({
  headers: {
    "User-Agent": "risureq-example"
  }
});

const response = await client.get("https://httpbin.org/get");
console.log(response.status);
```

Check `packages/node/README.md` for the supported client options and complete API examples.

## Python

### Install

```bash
pip install risureq
```

Python 3.10 or newer is required. Brotli support and test tools may be installed using the extras defined in `packages/python/pyproject.toml`.

### Quick start

```python
from risu_req import get, request

response = get("https://httpbin.org/get")
print(response.status_code)

result = request(
    "GET",
    "https://httpbin.org/headers",
    headers={"User-Agent": "risureq-example"},
)
print(result.status_code)
```

### Persistent client

```python
from risu_req import RisuClient

client = RisuClient()
response = client.get("https://httpbin.org/get")
print(response.status_code)
```

**Python naming note:** The install/distribution name can be `risureq` while the import package remains `risu_req`. These are separate names in Python packaging. The distribution name must be changed in `packages/python/pyproject.toml` before publishing under `risureq`.

See `packages/python/README.md` for the Python-specific API and options.

## Project structure

```text
risu-req/
├── packages/
│   ├── node/       # Node.js / TypeScript implementation
│   └── python/     # Python implementation
├── README.md       # This overview
└── LICENSE
```

## Development

### Node.js

```bash
cd packages/node
npm install
npm run build
npm test
```

### Python

Use Python 3.10 or newer. From `packages/python`, install the project and its test dependencies according to `pyproject.toml`, then run the project's tests.

## Security

- Use only trusted URLs and proxies.
- Do not place credentials, API keys, or sensitive cookies in source control.
- Review proxy and URL handling carefully when using the client with untrusted input.
- Keep dependencies up to date.

## Contributing

Issues and pull requests are welcome. When reporting a bug, include the runtime and version, a minimal reproducible example, and the relevant error output. Do not include secrets or private request data.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
