"""risu-req: Production-grade HTTP client library for Python."""

from risu_req.client import (
    RisuClient,
    delete,
    get,
    head,
    options,
    patch,
    post,
    put,
    request,
)
from risu_req.cookies import CookieEntry, CookieJar
from risu_req.errors import (
    ConnectionError,
    DnsError,
    MaxRedirectsError,
    ProtocolError,
    ProxyError,
    ResponseSizeLimitError,
    RisuError,
    SsrfError,
    TimeoutError,
    TlsError,
)
from risu_req.proxy import ProxyAuth, ProxyConfig
from risu_req.response import CaseInsensitiveDict, RisuResponse
from risu_req.retry import RateLimitInfo, RetryPolicy

Session = RisuClient

__version__ = "1.0.1"

__all__ = [
    "RisuClient",
    "Session",
    "RisuResponse",
    "CookieJar",
    "CookieEntry",
    "ProxyConfig",
    "ProxyAuth",
    "RetryPolicy",
    "RateLimitInfo",
    "CaseInsensitiveDict",
    "RisuError",
    "DnsError",
    "TlsError",
    "TimeoutError",
    "ConnectionError",
    "ProtocolError",
    "MaxRedirectsError",
    "ResponseSizeLimitError",
    "ProxyError",
    "SsrfError",
    "request",
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "__version__",
]
