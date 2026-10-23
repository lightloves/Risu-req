# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Defaults

- **TLS Verification**: Enabled by default using system trust stores. Disabling verification requires explicit opt-out.
- **SSRF Protection**: Prevents connection to private IP spaces (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`).
- **Cookie Isolation**: RFC 6265 compliant domain matching to prevent cross-origin cookie sharing.
- **Sensitive Header Stripping**: Cross-origin redirects automatically strip `Authorization`, `Cookie`, and `Proxy-Authorization` headers.
- **Protocol Downgrade Guard**: Redirects from HTTPS to HTTP are blocked by default.
- **Logging Redaction**: Sensitive authorization headers and credentials are masked before emitting to logging hooks.

## Reporting a Vulnerability

Please report security issues privately to `security@risu-req.org` or via GitHub Security Advisories. Do not open public issues for sensitive vulnerabilities.
