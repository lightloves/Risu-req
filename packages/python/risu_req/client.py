import base64
import json as _json
import ssl
import time
import urllib.parse
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import urllib3
from urllib3.exceptions import (
    ConnectTimeoutError,
    HTTPError,
    MaxRetryError,
    NewConnectionError,
    ReadTimeoutError,
    SSLError,
)
from risu_req.cookies import CookieJar
from risu_req.errors import (
    ConnectionError,
    DnsError,
    MaxRedirectsError,
    ProtocolError,
    ProxyError,
    RisuError,
    TimeoutError,
    TlsError,
)
from risu_req.proxy import (
    ProxyConfig,
    get_environment_proxy,
    parse_proxy_config,
    redact_proxy_url,
    should_bypass_proxy,
)
from risu_req.response import CaseInsensitiveDict, RisuResponse
from risu_req.retry import (
    RetryPolicy,
    calculate_retry_delay,
    is_retryable_exception,
    is_retryable_method,
    is_retryable_status_code,
    normalize_retry_policy,
)
from risu_req.security import (
    redact_headers_for_logging,
    redact_url_for_logging,
    sanitize_redirect_headers,
    validate_header,
    validate_url,
)
from risu_req.ssrf import verify_ssrf_safety


def classify_urllib3_error(
    exc: Exception, url: str, method: str
) -> RisuError:
    """Classify low-level transport errors into structured risu-req exceptions."""
    if isinstance(exc, RisuError):
        return exc

    if isinstance(exc, SSLError):
        return TlsError(
            f"TLS validation failed: {exc}",
            url=url,
            method=method,
            cause=exc,
        )

    if isinstance(exc, (ConnectTimeoutError, ReadTimeoutError)):
        phase = "connect" if isinstance(exc, ConnectTimeoutError) else "read"
        return TimeoutError(
            f"Network timeout ({phase}): {exc}",
            phase=phase,
            url=url,
            method=method,
            cause=exc,
        )

    if isinstance(exc, NewConnectionError):
        msg = str(exc).lower()
        if (
            "name or service not known" in msg
            or "nodename nor servname provided" in msg
            or "getaddrinfo failed" in msg
        ):
            return DnsError(
                f"DNS resolution failure: {exc}",
                url=url,
                method=method,
                cause=exc,
            )
        return ConnectionError(
            f"Connection refused: {exc}",
            url=url,
            method=method,
            cause=exc,
        )

    if isinstance(exc, MaxRetryError):
        if exc.reason:
            return classify_urllib3_error(exc.reason, url, method)

    return ConnectionError(
        f"Transport connection error: {exc}",
        url=url,
        method=method,
        cause=exc,
    )


class RisuClient:
    """Production-grade HTTP client with connection pooling, retries, and proxy support."""

    def __init__(
        self,
        base_url: str = "",
        headers: Optional[Dict[str, str]] = None,
        timeout: Union[float, Dict[str, float], None] = None,
        proxy: Union[str, ProxyConfig, dict, None] = None,
        retries: Union[bool, RetryPolicy, dict, None] = None,
        pool: Optional[Dict[str, Any]] = None,
        tls: Optional[Dict[str, Any]] = None,
        cookies: Union[bool, CookieJar, None] = None,
        ssrf_protection: bool = False,
        max_response_size: Optional[int] = None,
        max_redirects: int = 10,
        follow_redirects: bool = True,
        logging: Optional[Dict[str, Callable[..., None]]] = None,
    ) -> None:
        self.base_url = base_url
        self.default_headers = dict(headers or {})
        self.timeout = timeout
        self.proxy = proxy
        self.retries = retries
        self.pool_config = pool or {}
        self.tls_config = tls or {}
        self.ssrf_protection = ssrf_protection
        self.max_response_size = max_response_size
        self.max_redirects = max_redirects
        self.follow_redirects = follow_redirects
        self.logging = logging or {}
        self.is_closed = False

        if cookies is True:
            self.cookie_jar: Optional[CookieJar] = CookieJar()
        elif isinstance(cookies, CookieJar):
            self.cookie_jar = cookies
        else:
            self.cookie_jar = None

        maxsize = self.pool_config.get("max_connections", 64)
        cert_reqs = (
            ssl.CERT_NONE
            if self.tls_config.get("verify") is False
            else ssl.CERT_REQUIRED
        )
        ca_certs = self.tls_config.get("ca") or self.tls_config.get("ca_cert")
        cert_file = self.tls_config.get("cert")
        key_file = self.tls_config.get("key")

        self._pool_manager = urllib3.PoolManager(
            num_pools=maxsize,
            maxsize=maxsize,
            cert_reqs=cert_reqs,
            ca_certs=ca_certs,
            cert_file=cert_file,
            key_file=key_file,
            retries=False,
        )

        self._proxy_managers: Dict[str, urllib3.ProxyManager] = {}

    def _get_timeout(
        self, req_timeout: Union[float, Dict[str, float], None]
    ) -> urllib3.Timeout:
        """Resolve urllib3.Timeout from client and request configurations."""
        chosen = req_timeout if req_timeout is not None else self.timeout
        if chosen is None:
            return urllib3.Timeout(total=None)
        if isinstance(chosen, (int, float)):
            return urllib3.Timeout(total=float(chosen))
        if isinstance(chosen, dict):
            return urllib3.Timeout(
                connect=chosen.get("connect"),
                read=chosen.get("read"),
                total=chosen.get("total"),
            )
        return urllib3.Timeout(total=None)

    def _get_proxy_manager(self, config: ProxyConfig) -> urllib3.ProxyManager:
        """Retrieve or construct a cached ProxyManager for the target proxy."""
        key = config.url
        if key not in self._proxy_managers:
            proxy_headers: Dict[str, str] = {}
            if config.auth:
                cred = f"{config.auth.username}:{config.auth.password}"
                encoded = base64.b64encode(cred.encode("utf-8")).decode("ascii")
                proxy_headers["Proxy-Authorization"] = f"Basic {encoded}"

            cert_reqs = (
                ssl.CERT_NONE
                if self.tls_config.get("verify") is False
                else ssl.CERT_REQUIRED
            )
            self._proxy_managers[key] = urllib3.ProxyManager(
                config.url,
                proxy_headers=proxy_headers,
                cert_reqs=cert_reqs,
                retries=False,
            )
        return self._proxy_managers[key]

    def request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        body: Union[str, bytes, None] = None,
        json: Any = None,
        form: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
        timeout: Union[float, Dict[str, float], None] = None,
        proxy: Union[str, ProxyConfig, dict, bool, None] = None,
        retries: Union[bool, RetryPolicy, dict, None] = None,
        max_response_size: Optional[int] = None,
        max_redirects: Optional[int] = None,
        follow_redirects: Optional[bool] = None,
        ssrf_protection: Optional[bool] = None,
        decompress: bool = True,
    ) -> RisuResponse:
        """Execute an HTTP request with retries, pooling, cookie management, and redirects."""
        if self.is_closed:
            raise RisuError("RisuClient has been closed")

        norm_method = method.upper()
        target_url = validate_url(url, self.base_url)

        if params:
            parsed_url = urllib.parse.urlparse(target_url)
            query_items = urllib.parse.parse_qsl(parsed_url.query)
            for k, v in params.items():
                if v is not None:
                    if isinstance(v, (list, tuple)):
                        for item in v:
                            query_items.append((k, str(item)))
                    else:
                        query_items.append((k, str(v)))
            new_query = urllib.parse.urlencode(query_items)
            target_url = urllib.parse.urlunparse(
                (
                    parsed_url.scheme,
                    parsed_url.netloc,
                    parsed_url.path,
                    parsed_url.params,
                    new_query,
                    parsed_url.fragment,
                )
            )

        merged_headers: Dict[str, str] = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "User-Agent": "risu-req/1.0.0",
        }
        merged_headers.update(self.default_headers)
        if headers:
            merged_headers.update(headers)

        payload_bytes: Optional[bytes] = None
        fields_data: Optional[Dict[str, Any]] = None

        if json is not None:
            encoded_json = _json.dumps(json, ensure_ascii=False)
            payload_bytes = encoded_json.encode("utf-8")
            if not any(k.lower() == "content-type" for k in merged_headers):
                merged_headers["Content-Type"] = "application/json; charset=utf-8"
        elif form is not None:
            encoded_form = urllib.parse.urlencode(form)
            payload_bytes = encoded_form.encode("utf-8")
            if not any(k.lower() == "content-type" for k in merged_headers):
                merged_headers["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8"
        elif files is not None:
            fields_data = dict(files)
            if body and isinstance(body, dict):
                fields_data.update(body)
        elif body is not None:
            if isinstance(body, str):
                payload_bytes = body.encode("utf-8")
            elif isinstance(body, bytes):
                payload_bytes = body

        for k, v in merged_headers.items():
            validate_header(k, str(v))

        active_retries = (
            normalize_retry_policy(retries)
            if retries is not None
            else normalize_retry_policy(self.retries)
        )
        should_follow = (
            follow_redirects if follow_redirects is not None else self.follow_redirects
        )
        redirect_limit = (
            max_redirects if max_redirects is not None else self.max_redirects
        )
        enforce_ssrf = (
            ssrf_protection if ssrf_protection is not None else self.ssrf_protection
        )
        effective_max_size = (
            max_response_size
            if max_response_size is not None
            else self.max_response_size
        )
        req_timeout_obj = self._get_timeout(timeout)

        attempt = 0
        max_attempts = active_retries.max_retries if active_retries else 0

        while True:
            attempt += 1
            start_time = time.time()

            if "on_request" in self.logging:
                self.logging["on_request"](
                    {
                        "method": norm_method,
                        "url": redact_url_for_logging(target_url),
                        "headers": redact_headers_for_logging(merged_headers),
                        "has_body": payload_bytes is not None or fields_data is not None,
                    }
                )

            current_url = target_url
            current_headers = dict(merged_headers)
            current_method = norm_method
            redirect_count = 0

            try:
                while True:
                    if enforce_ssrf:
                        host_for_ssrf = urllib.parse.urlparse(current_url).hostname or ""
                        verify_ssrf_safety(host_for_ssrf)

                    if self.cookie_jar:
                        cookie_hdr = self.cookie_jar.get_cookie_string(current_url)
                        if cookie_hdr:
                            current_headers["Cookie"] = cookie_hdr

                    active_proxy: Optional[ProxyConfig] = None
                    if proxy is not False:
                        if proxy:
                            active_proxy = parse_proxy_config(proxy)
                        elif self.proxy:
                            active_proxy = parse_proxy_config(self.proxy)
                        else:
                            active_proxy = get_environment_proxy(current_url)

                    if active_proxy and should_bypass_proxy(
                        current_url, active_proxy.bypass
                    ):
                        active_proxy = None

                    manager = (
                        self._get_proxy_manager(active_proxy)
                        if active_proxy
                        else self._pool_manager
                    )

                    try:
                        resp = manager.request(
                            current_method,
                            current_url,
                            headers=current_headers,
                            body=payload_bytes if current_method == norm_method else None,
                            fields=fields_data if current_method == norm_method else None,
                            timeout=req_timeout_obj,
                            redirect=False,
                            preload_content=False,
                        )
                    except Exception as transport_err:
                        classified = classify_urllib3_error(
                            transport_err, current_url, current_method
                        )
                        raise classified from transport_err

                    resp_headers = CaseInsensitiveDict(resp.headers)

                    if self.cookie_jar:
                        set_cookies = resp.headers.getlist("set-cookie") or []
                        if not set_cookies and "set-cookie" in resp_headers:
                            set_cookies = [resp_headers["set-cookie"]]
                        self.cookie_jar.set_cookies(set_cookies, current_url)

                    is_redirect = (
                        resp.status in (301, 302, 303, 307, 308)
                        and "location" in resp_headers
                    )

                    if should_follow and is_redirect:
                        redirect_count += 1
                        if redirect_count > redirect_limit:
                            raise MaxRedirectsError(
                                f"Maximum redirect limit of {redirect_limit} exceeded",
                                redirect_count=redirect_count,
                                url=current_url,
                                method=current_method,
                            )

                        raw_location = resp_headers["location"]
                        next_url = validate_url(raw_location, current_url)

                        if enforce_ssrf:
                            next_host = urllib.parse.urlparse(next_url).hostname or ""
                            verify_ssrf_safety(next_host)

                        current_headers = sanitize_redirect_headers(
                            current_headers, current_url, next_url
                        )

                        if resp.status == 303 or (
                            resp.status in (301, 302) and current_method == "POST"
                        ):
                            current_method = "GET"
                            current_headers.pop("Content-Length", None)
                            current_headers.pop("content-length", None)
                            current_headers.pop("Content-Type", None)
                            current_headers.pop("content-type", None)

                        current_url = next_url
                        resp.release_conn()
                        continue

                    duration_ms = (time.time() - start_time) * 1000
                    if "on_response" in self.logging:
                        self.logging["on_response"](
                            {
                                "method": current_method,
                                "url": redact_url_for_logging(current_url),
                                "status_code": resp.status,
                                "reason": resp.reason or "",
                                "headers": redact_headers_for_logging(resp_headers),
                                "duration_ms": duration_ms,
                            }
                        )

                    if (
                        active_retries
                        and attempt <= max_attempts
                        and is_retryable_method(norm_method, active_retries)
                        and is_retryable_status_code(resp.status, active_retries)
                    ):
                        retry_after_hdr = resp_headers.get("retry-after")
                        delay = calculate_retry_delay(
                            attempt, active_retries, retry_after_hdr
                        )

                        if "on_retry" in self.logging:
                            self.logging["on_retry"](
                                {
                                    "method": norm_method,
                                    "url": redact_url_for_logging(target_url),
                                    "attempt": attempt,
                                    "max_retries": max_attempts,
                                    "delay_seconds": delay,
                                    "reason": f"Status code {resp.status}",
                                }
                            )

                        resp.release_conn()
                        time.sleep(delay)
                        break

                    risu_response = RisuResponse(
                        status_code=resp.status,
                        reason=resp.reason or "",
                        headers=resp_headers,
                        url=current_url,
                        raw_stream=resp.stream(amt=8192),
                        max_response_size=effective_max_size,
                        decompress=decompress,
                        method=current_method,
                    )
                    return risu_response

            except Exception as err:
                duration_ms = (time.time() - start_time) * 1000
                if "on_error" in self.logging:
                    self.logging["on_error"](
                        {
                            "method": norm_method,
                            "url": redact_url_for_logging(target_url),
                            "error": err,
                            "duration_ms": duration_ms,
                        }
                    )

                if (
                    active_retries
                    and attempt <= max_attempts
                    and is_retryable_method(norm_method, active_retries)
                    and is_retryable_exception(err)
                ):
                    delay = calculate_retry_delay(attempt, active_retries)
                    if "on_retry" in self.logging:
                        self.logging["on_retry"](
                            {
                                "method": norm_method,
                                "url": redact_url_for_logging(target_url),
                                "attempt": attempt,
                                "max_retries": max_attempts,
                                "delay_seconds": delay,
                                "reason": str(err),
                            }
                        )
                    time.sleep(delay)
                    continue

                raise

    def get(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a GET request."""
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a POST request."""
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a PUT request."""
        return self.request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a PATCH request."""
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a DELETE request."""
        return self.request("DELETE", url, **kwargs)

    def head(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send a HEAD request."""
        return self.request("HEAD", url, **kwargs)

    def options(self, url: str, **kwargs: Any) -> RisuResponse:
        """Send an OPTIONS request."""
        return self.request("OPTIONS", url, **kwargs)

    def close(self) -> None:
        """Gracefully release connection pools and network sockets."""
        if self.is_closed:
            return
        self.is_closed = True
        self._pool_manager.clear()
        for p_mgr in self._proxy_managers.values():
            p_mgr.clear()
        self._proxy_managers.clear()

    def __enter__(self) -> "RisuClient":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()


_global_client: Optional[RisuClient] = None


def get_default_client() -> RisuClient:
    """Retrieve or initialize module-level default client instance."""
    global _global_client
    if _global_client is None:
        _global_client = RisuClient()
    return _global_client


def request(method: str, url: str, **kwargs: Any) -> RisuResponse:
    """Send an HTTP request using default client."""
    return get_default_client().request(method, url, **kwargs)


def get(url: str, **kwargs: Any) -> RisuResponse:
    """Send a GET request using default client."""
    return get_default_client().get(url, **kwargs)


def post(url: str, **kwargs: Any) -> RisuResponse:
    """Send a POST request using default client."""
    return get_default_client().post(url, **kwargs)


def put(url: str, **kwargs: Any) -> RisuResponse:
    """Send a PUT request using default client."""
    return get_default_client().put(url, **kwargs)


def patch(url: str, **kwargs: Any) -> RisuResponse:
    """Send a PATCH request using default client."""
    return get_default_client().patch(url, **kwargs)


def delete(url: str, **kwargs: Any) -> RisuResponse:
    """Send a DELETE request using default client."""
    return get_default_client().delete(url, **kwargs)


def head(url: str, **kwargs: Any) -> RisuResponse:
    """Send a HEAD request using default client."""
    return get_default_client().head(url, **kwargs)


def options(url: str, **kwargs: Any) -> RisuResponse:
    """Send an OPTIONS request using default client."""
    return get_default_client().options(url, **kwargs)
