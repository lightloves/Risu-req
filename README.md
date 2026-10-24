# risureq

<p align="center">
  <a href="https://www.npmjs.com/package/risureq">
    <img alt="Install from npm" src="https://nodei.co/npm/risureq.png?downloads=true&downloadRank=true&stars=true" />
  </a>
</p>

<p align="center">
  <a href="https://pypi.org/project/risureq/">
    <img alt="Install from PyPI" src="https://img.shields.io/badge/Install%20from-PyPI-blue?style=for-the-badge&logo=pypi&logoColor=white" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/risureq">
    <img alt="npm version" src="https://img.shields.io/npm/v/risureq?style=for-the-badge&logo=npm" />
  </a>
  <a href="https://pypi.org/project/risureq/">
    <img alt="PyPI version" src="https://img.shields.io/pypi/v/risureq?style=for-the-badge&logo=pypi" />
  </a>
  <a href="LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" />
  </a>
</p>

**risureq** is an HTTP client project with implementations for **Node.js** and **Python**. It provides tools for HTTP requests, headers, cookies, proxies, sessions, and response handling.

> The npm package is `risureq`. The Python distribution is intended to use the same name; update `packages/python/pyproject.toml` and verify the name is available on PyPI before publishing.

## Implementations

| Runtime | Package | Requirement | Install |
|---|---|---|---|
| Node.js | [npm: risureq](https://www.npmjs.com/package/risureq) | Node.js 18+ | `npm install risureq` |
| Python | [PyPI: risureq](https://pypi.org/project/risureq/) | Python 3.10+ | `pip install risureq` |

## Features

- Custom request headers
- Cookie handling and persistent sessions
- Proxy configuration
- Connection reuse and pooling
- Common HTTP methods
- Structured responses and error handling
- Retry support
- Brotli decoding support where configured
- TypeScript declarations for Node.js
- Optional extras for Python

Feature availability and configuration may differ between implementations. Check the relevant package README for details.

## Node.js

### Install

```bash
npm install risureq
```

### Quick start

```javascript
import { get, request, RisuClient } from "risureq";

const response = await get("https://httpbin.org/get");
console.log(response.status);
console.log(response.data);

const result = await request("https://httpbin.org/headers", {
  method: "GET",
  headers: { "User-Agent": "risureq-example" }
});
console.log(result.status);
```

### Persistent client

```javascript
import { RisuClient } from "risureq";

const client = new RisuClient({
  headers: { "User-Agent": "risureq-example" }
});

const response = await client.get("https://httpbin.org/get");
console.log(response.status);
```

See [`packages/node/README.md`](packages/node/README.md) for the complete Node.js API.

## Python

### Install

```bash
pip install risureq
```

Python 3.10 or newer is required. Check `packages/python/pyproject.toml` for optional extras and test dependencies.

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

The Python distribution name (`risureq`) can differ from its import name (`risu_req`). Update the distribution metadata before publishing it under `risureq`.

See [`packages/python/README.md`](packages/python/README.md) for Python-specific details.

## Project structure

```text
risu-req/
├── packages/
│   ├── node/       # Node.js / TypeScript
│   └── python/     # Python
├── README.md
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

Use Python 3.10 or newer. From `packages/python`, install the project and test dependencies as specified in `pyproject.toml`, then run the project's tests.

## Security

- Do not commit credentials, API keys, or sensitive cookies.
- Use trusted URLs and proxies.
- Review URL and proxy handling when accepting untrusted input.
- Keep dependencies updated.

## Contributing

Issues and pull requests are welcome. Include the runtime/version, a minimal reproducible example, and relevant error output. Never include secrets or private request data.

## License

MIT. See [LICENSE](LICENSE).
