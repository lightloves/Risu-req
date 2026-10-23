# Contributing to risu-req

Thank you for your interest in contributing to `risu-req`!

## Code Quality Standards

1. **Dual Implementation Equivalence**: New features must be evaluated and implemented consistently in both the Node.js and Python packages.
2. **Comment-Free Source Code**: Do not add inline or block comments (`//`, `/* */`, `#`) to source logic. Use descriptive identifiers, explicit types, and formal docstrings.
3. **Automated Verification**:
   - Node.js: All tests must run via `npm test` and pass without errors. Type checking must pass via `npm run typecheck`.
   - Python: All tests must run via `pytest` and pass without errors.
4. **Security Focus**: Never introduce vulnerabilities (e.g. CRLF injection, unsafe redirects, unverified TLS, secret leaks in logs).

## Development Setup

### Node.js

```bash
cd packages/node
npm install
npm run build
npm test
```

### Python

```bash
cd packages/python
pip install -e .[test]
pytest tests -v
```
