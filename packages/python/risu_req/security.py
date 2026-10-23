import re
from typing import Dict
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse
from risu_req.errors import ProtocolError

SENSITIVE_HEADER_NAMES = {
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "api-key",
    "x-auth-token",
    "bearer",
    "token",
    "x-access-token",
    "x-secret-key",
    "client-secret",
}

SENSITIVE_PARAM_NAMES = {
    "token",
    "secret",
    "password",
    "passwd",
    "api_key",
    "apikey",
    "key",
    "access_token",
    "auth",
    "client_secret",
}


def validate_header(name: str, value: str) -> None:
    """Validate header key and value preventing HTTP response splitting and CRLF injection."""
    if not isinstance(name, str) or not name.strip():
        raise ProtocolError("Header name must be a non-empty string")

    if not re.match(r"^[a-zA-Z0-9!#$%&'*+-.^_`|~]+$", name):
        raise ProtocolError(f"Invalid character in header name: {name}")

    if not isinstance(value, str):
        raise ProtocolError(f"Header value for {name} must be a string")

    if "\r" in value or "\n" in value:
        raise ProtocolError(
            f"Header value for {name} must not contain newline or carriage return characters"
        )


def validate_url(url: str, base_url: str = "") -> str:
    """Validate URL syntax, verify scheme is HTTP or HTTPS, and resolve base URL."""
    if not isinstance(url, str) or not url.strip():
        raise ProtocolError("URL must be a non-empty string")

    if "\r" in url or "\n" in url:
        raise ProtocolError("URL must not contain carriage return or newline characters")

    resolved = urljoin(base_url, url) if base_url else url
    parsed = urlparse(resolved)

    if parsed.scheme.lower() not in ("http", "https"):
        raise ProtocolError(
            f"Unsupported protocol: {parsed.scheme}. Only http: and https: are allowed."
        )

    if not parsed.netloc:
        raise ProtocolError(f"Malformed URL missing hostname: {url}")

    return resolved


def sanitize_redirect_headers(
    headers: Dict[str, str],
    from_url: str,
    to_url: str,
    allow_insecure_downgrade: bool = False,
) -> Dict[str, str]:
    """Strip sensitive credentials across origins and prevent protocol downgrade."""
    from_parsed = urlparse(from_url)
    to_parsed = urlparse(to_url)

    if (
        from_parsed.scheme.lower() == "https"
        and to_parsed.scheme.lower() == "http"
        and not allow_insecure_downgrade
    ):
        raise ProtocolError(
            f"Insecure redirect downgrade from HTTPS to HTTP blocked: {to_url}"
        )

    result = dict(headers)

    from_scheme = from_parsed.scheme.lower()
    to_scheme = to_parsed.scheme.lower()
    from_host = (from_parsed.hostname or "").lower()
    to_host = (to_parsed.hostname or "").lower()

    from_port = from_parsed.port or (443 if from_scheme == "https" else 80)
    to_port = to_parsed.port or (443 if to_scheme == "https" else 80)

    is_same_host = from_host == to_host
    is_https_upgrade = from_scheme == "http" and to_scheme == "https"
    is_port_compatible = (
        ((from_port == 80 and to_port == 443) or from_port == to_port)
        if is_https_upgrade
        else from_port == to_port
    )

    is_cross_domain = (
        not is_same_host
        or (not is_https_upgrade and (from_scheme, from_host, from_port) != (to_scheme, to_host, to_port))
        or not is_port_compatible
    )

    if is_cross_domain:
        result.pop("authorization", None)
        result.pop("Authorization", None)
        result.pop("proxy-authorization", None)
        result.pop("Proxy-Authorization", None)
        result.pop("cookie", None)
        result.pop("Cookie", None)

    return result


def redact_headers_for_logging(headers: Dict[str, str]) -> Dict[str, str]:
    """Redact sensitive authorization, cookies, and tokens from logging output."""
    sanitized: Dict[str, str] = {}
    for key, val in headers.items():
        if key.lower() in SENSITIVE_HEADER_NAMES:
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = val
    return sanitized


def redact_url_for_logging(url: str) -> str:
    """Mask passwords and secret query parameters from target URL string."""
    try:
        parsed = urlparse(url)
        netloc = parsed.netloc
        if parsed.password:
            netloc = f"{parsed.username}:***@{parsed.hostname}"
            if parsed.port:
                netloc = f"{netloc}:{parsed.port}"

        query_dict = parse_qs(parsed.query, keep_blank_values=True)
        sanitized_query = []
        for q_key, q_vals in query_dict.items():
            if q_key.lower() in SENSITIVE_PARAM_NAMES:
                for _ in q_vals:
                    sanitized_query.append((q_key, "***"))
            else:
                for v in q_vals:
                    sanitized_query.append((q_key, v))

        new_query = urlencode(sanitized_query, safe="*")
        return urlunparse(
            (
                parsed.scheme,
                netloc,
                parsed.path,
                parsed.params,
                new_query,
                parsed.fragment,
            )
        )
    except Exception:
        return url
