from typing import Any, Optional


class RisuError(Exception):
    """Base exception for all risu-req errors."""

    def __init__(
        self,
        message: str,
        code: str = "ERR_RISU_REQUEST",
        url: Optional[str] = None,
        method: Optional[str] = None,
        status_code: Optional[int] = None,
        cause: Optional[Exception] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.url = url
        self.method = method
        self.status_code = status_code
        self.cause = cause


class DnsError(RisuError):
    """Raised when DNS resolution fails."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("code", "ERR_RISU_DNS")
        super().__init__(message, **kwargs)


class TlsError(RisuError):
    """Raised when TLS negotiation or certificate verification fails."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("code", "ERR_RISU_TLS")
        super().__init__(message, **kwargs)


class TimeoutError(RisuError):
    """Raised when an operation exceeds its configured timeout limit."""

    def __init__(
        self,
        message: str,
        phase: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        kwargs.setdefault("code", "ERR_RISU_TIMEOUT")
        super().__init__(message, **kwargs)
        self.phase = phase


class ConnectionError(RisuError):
    """Raised when transport connection cannot be established or is abruptly broken."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("code", "ERR_RISU_CONNECTION")
        super().__init__(message, **kwargs)


class ProtocolError(RisuError):
    """Raised when an HTTP protocol violation occurs."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("code", "ERR_RISU_PROTOCOL")
        super().__init__(message, **kwargs)


class MaxRedirectsError(RisuError):
    """Raised when request redirection exceeds configured maximum hops."""

    def __init__(
        self,
        message: str,
        redirect_count: int,
        **kwargs: Any,
    ) -> None:
        kwargs.setdefault("code", "ERR_RISU_MAX_REDIRECTS")
        super().__init__(message, **kwargs)
        self.redirect_count = redirect_count


class ResponseSizeLimitError(RisuError):
    """Raised when incoming response body exceeds maximum allowed bytes."""

    def __init__(
        self,
        message: str,
        max_bytes: int,
        received_bytes: int,
        **kwargs: Any,
    ) -> None:
        kwargs.setdefault("code", "ERR_RISU_RESPONSE_SIZE")
        super().__init__(message, **kwargs)
        self.max_bytes = max_bytes
        self.received_bytes = received_bytes


class ProxyError(RisuError):
    """Raised when proxy connection, tunnel negotiation, or authentication fails."""

    def __init__(self, message: str, **kwargs: Any) -> None:
        kwargs.setdefault("code", "ERR_RISU_PROXY")
        super().__init__(message, **kwargs)


class SsrfError(RisuError):
    """Raised when SSRF protection blocks a request to restricted IP or hostname."""

    def __init__(
        self,
        message: str,
        host: str,
        resolved_address: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        kwargs.setdefault("code", "ERR_RISU_SSRF")
        super().__init__(message, **kwargs)
        self.host = host
        self.resolved_address = resolved_address
