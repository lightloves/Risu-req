# RisuReq

**A production-focused HTTP client for Node.js and Python.**

RisuReq is a cross-language HTTP client project designed for configurable requests, connection management, cookie handling, proxy support, and resilient retries.

<p align="center">
  <a href="https://www.npmjs.com/package/risureq">
    <img alt="NPM package" src="https://img.shields.io/badge/NPM-Install%20risureq-CB3837?style=for-the-badge&logo=npm&logoColor=white" />
  </a>
  <br><br>
  <a href="https://pypi.org/project/risureq/">
    <img alt="PyPI package" src="https://img.shields.io/badge/PyPI-Install%20risureq-3775A9?style=for-the-badge&logo=pypi&logoColor=white" />
  </a>
  <br><br>
  <a href="LICENSE">
    <img alt="MIT License" src="https://img.shields.io/badge/LICENSE-MIT-green?style=for-the-badge" />
  </a>
</p>

## Features

- **Connection Management** — Reuse connections for efficient HTTP requests.
- **Cookie Jar** — Maintain cookies across requests.
- **Proxy Support** — Configure proxy connections and authentication.
- **Retry System** — Configurable retries with exponential backoff and jitter.
- **Rate-Limit Handling** — Parse rate-limit metadata and retry timing.
- **Security Controls** — SSRF protection and sensitive-header handling.
- **Redirect Handling** — Control redirect behavior.
- **Response Management** — Structured responses, timeout controls, and response-size limits.
- **Multiple HTTP Methods** — GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS.
- **Two Languages** — Separate Node.js and Python packages.

## Installation

### Node.js

```bash
npm install risureq
```

### Python

```bash
python -m pip install risureq
```

## Quick Start

### Python

```python
import risu_req

response = risu_req.get("https://httpbin.org/get")

print(response.status_code)
print(response.json())
```

### Node.js

```javascript
const { RisuClient } = require("risureq");
```

## Project Structure

```text
RisuReq/
├── packages/
│   ├── node/       # Node.js package
│   └── python/     # Python package
├── LICENSE
└── README.md
```

## License

RisuReq is released under the MIT License. See [LICENSE](LICENSE) for details.
