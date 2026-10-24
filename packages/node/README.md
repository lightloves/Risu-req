<div align="center">

# ⚡ risureq

### One client. Powerful networking. Developer-first control.

A TypeScript-powered HTTP client for Node.js, designed for reliable requests, configurable networking, and security-conscious defaults.

[![npm version](https://img.shields.io/npm/v/risureq?style=for-the-badge&color=cb3837)](https://www.npmjs.com/package/risureq)
[![npm downloads](https://img.shields.io/npm/dm/risureq?style=for-the-badge&color=blue)](https://www.npmjs.com/package/risureq)
[![License: MIT](https://img.shields.io/badge/license-MIT-8b5cf6?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**Reliable requests. Thoughtful engineering.**

</div>

---

## ✨ Overview

`risureq` is an HTTP client library for Node.js that brings common networking controls into a consistent API. It is designed for projects that need more than a minimal request wrapper, with features for connection reuse, cookies, proxies, retry policies, redirect handling, and response decompression.

## 🚀 Features

| Feature | Description |
|---|---|
| Connection management | Reuse connections to reduce repeated setup overhead |
| Cookie handling | Manage cookies across requests |
| Proxy support | Configure proxy servers and authentication |
| Retry controls | Configure retries for eligible transient failures |
| Timeouts | Bound connection and response waiting time |
| Redirect safeguards | Control redirect behavior and sensitive-header forwarding |
| SSRF defenses | Protect against unsafe destinations according to supported configuration |
| Compression | Decode supported compressed responses, including Brotli where supported |
| TypeScript | Type declarations for a developer-friendly experience |
| Lightweight runtime | Designed with zero external runtime dependencies |

> Feature availability and behavior can depend on configuration and the current release. Check the source and tests before relying on a security control in a production threat model.

## 📦 Installation

```bash
npm install risureq
```

**Requirements:** Node.js 18 or later.

## ⚡ Quick start

```javascript
import { request } from "risureq";

async function main() {
  const response = await request("https://example.com");

  console.log("Status:", response.status);
  console.log(await response.text());
}

main().catch(console.error);
```

## CommonJS

If your project uses CommonJS, you can use the package's CommonJS entry point:

```javascript
const { request } = require("risureq");

async function main() {
  const response = await request("https://example.com");

  console.log("Status:", response.status);
  console.log(await response.text());
}

main().catch(console.error);
```

## 🛡️ Security-minded networking

HTTP clients connect your application to external systems. `risureq` is designed with controls such as URL validation, redirect safeguards, sensitive-header handling, and SSRF defenses where supported.

For production use, review the project's security documentation and validate the behavior against your own threat model. Never assume a security feature is enabled unless the configuration and documentation confirm it.

## 🧪 Development

Clone the repository:

```bash
git clone https://github.com/lightloves/Risu-req.git
cd Risu-req/packages/node
```

Install development dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## 📚 Project links

- **npm package:** https://www.npmjs.com/package/risureq
- **Source repository:** https://github.com/lightloves/Risu-req
- **Issue tracker:** https://github.com/lightloves/Risu-req/issues

## 🤝 Contributing

Bug reports, suggestions, and contributions are welcome. Please review the repository's contribution guidelines before opening a pull request.

## 📄 License

This project is distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

<div align="center">

**risureq** · Reliable requests. Thoughtful engineering.

</div>
