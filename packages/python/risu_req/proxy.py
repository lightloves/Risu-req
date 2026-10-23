import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from urllib.parse import unquote, urlparse
from risu_req.errors import ProxyError


@dataclass
class ProxyAuth:
    """Authentication credentials for HTTP proxy."""

    username: str
    password: str


@dataclass
class ProxyConfig:
    """Configured proxy settings."""

    url: str
    auth: Optional[ProxyAuth] = None
    bypass: List[str] = field(default_factory=list)

    @property
    def host(self) -> str:
        """Target hostname of proxy server."""
        return urlparse(self.url).hostname or ""

    @property
    def port(self) -> Optional[int]:
        """Target port of proxy server."""
        return urlparse(self.url).port


def redact_proxy_url(url_or_config: Union[str, ProxyConfig, Dict[str, Any]]) -> str:
    """Remove sensitive password credentials from proxy URL for safe logging."""
    if isinstance(url_or_config, ProxyConfig):
        raw = url_or_config.url
    elif isinstance(url_or_config, dict):
        raw = str(url_or_config.get("url", ""))
    else:
        raw = str(url_or_config)

    try:
        parsed = urlparse(raw)
        if parsed.password:
            netloc = f"{parsed.username}:***@{parsed.hostname}"
            if parsed.port:
                netloc = f"{netloc}:{parsed.port}"
            return parsed._replace(netloc=netloc).geturl()
        return raw
    except Exception:
        return "[redacted-proxy-url]"


def parse_proxy_config(
    proxy: Union[str, ProxyConfig, Dict[str, Any], None]
) -> Optional[ProxyConfig]:
    """Normalize user proxy input into a structured ProxyConfig."""
    if not proxy:
        return None

    if isinstance(proxy, ProxyConfig):
        return proxy

    if isinstance(proxy, dict):
        raw_url = str(proxy.get("url", ""))
        auth_val = proxy.get("auth")
        auth_obj = None
        if isinstance(auth_val, ProxyAuth):
            auth_obj = auth_val
        elif isinstance(auth_val, dict):
            auth_obj = ProxyAuth(
                username=str(auth_val.get("username", "")),
                password=str(auth_val.get("password", "")),
            )
        bypass_rules = proxy.get("bypass", [])
        return ProxyConfig(url=raw_url, auth=auth_obj, bypass=list(bypass_rules))

    parsed = urlparse(proxy)
    auth = None
    if parsed.username or parsed.password:
        auth = ProxyAuth(
            username=unquote(parsed.username or ""),
            password=unquote(parsed.password or ""),
        )

    clean_url = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port:
        clean_url = f"{clean_url}:{parsed.port}"

    return ProxyConfig(url=clean_url, auth=auth, bypass=[])


def should_bypass_proxy(target_url: str, bypass_rules: Optional[List[str]] = None) -> bool:
    """Determine whether destination matches proxy exclusion list."""
    if not bypass_rules:
        return False

    parsed = urlparse(target_url)
    target_host = (parsed.hostname or "").lower()
    target_port = str(parsed.port or (443 if parsed.scheme == "https" else 80))

    for raw_rule in bypass_rules:
        rule = raw_rule.strip().lower()
        if rule == "*":
            return True

        if ":" in rule:
            rule_host, rule_port = rule.split(":", 1)
            if rule_port == target_port and (
                target_host == rule_host or target_host.endswith(f".{rule_host}")
            ):
                return True

        if rule.startswith("."):
            if target_host.endswith(rule) or target_host == rule[1:]:
                return True
        elif rule.startswith("*."):
            if target_host.endswith(rule[1:]):
                return True
        else:
            if target_host == rule or target_host.endswith(f".{rule}"):
                return True

    return False


def get_environment_proxy(target_url: str) -> Optional[ProxyConfig]:
    """Detect and parse proxy settings from standard environment variables."""
    parsed = urlparse(target_url)
    is_https = parsed.scheme.lower() == "https"

    raw_no_proxy = os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or ""
    bypass_list = [item.strip() for item in raw_no_proxy.split(",") if item.strip()]

    if should_bypass_proxy(target_url, bypass_list):
        return None

    proxy_str = None
    if is_https:
        proxy_str = (
            os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("ALL_PROXY")
            or os.environ.get("all_proxy")
        )
    else:
        proxy_str = (
            os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
            or os.environ.get("ALL_PROXY")
            or os.environ.get("all_proxy")
        )

    if not proxy_str:
        return None

    config = parse_proxy_config(proxy_str)
    if config:
        config.bypass = bypass_list
    return config
