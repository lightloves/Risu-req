# risu-req (Python)

Production-grade HTTP client library for Python with connection pooling, cookie jar, proxy tunneling, and resilient retries.

## Installation

```bash
pip install risu-req
```

## Quick Start

```python
import risu_req

# Convenience API
response = risu_req.get("https://httpbin.org/get")
print(response.status_code, response.json())

# Client with connection pooling and cookies
with risu_req.RisuClient(cookies=True, timeout=10.0) as client:
    res = client.post("https://httpbin.org/post", json={"hello": "world"})
    print(res.status_code, res.text)
```
