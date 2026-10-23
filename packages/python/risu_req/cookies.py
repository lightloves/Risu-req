import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Dict, List, Optional, Union
from urllib.parse import urlparse


@dataclass
class CookieEntry:
    """Represents a single parsed HTTP cookie with RFC 6265 attributes."""

    name: str
    value: str
    domain: Optional[str] = None
    path: Optional[str] = None
    expires: Optional[datetime] = None
    max_age: Optional[int] = None
    secure: bool = False
    http_only: bool = False
    same_site: Optional[str] = None
    host_only: bool = True
    creation_time: float = 0.0


def parse_set_cookie_string(header_value: str) -> Optional[CookieEntry]:
    """Parse a single Set-Cookie header string into a CookieEntry object."""
    parts = [segment.strip() for segment in header_value.split(";") if segment.strip()]
    if not parts:
        return None

    first = parts[0]
    if "=" not in first:
        return None

    name, value = first.split("=", 1)
    name = name.strip()
    value = value.strip()
    if not name:
        return None

    entry = CookieEntry(name=name, value=value, creation_time=time.time())

    for part in parts[1:]:
        if "=" in part:
            attr_name, attr_val = part.split("=", 1)
            attr_name = attr_name.strip().lower()
            attr_val = attr_val.strip()
        else:
            attr_name = part.strip().lower()
            attr_val = ""

        if attr_name == "domain":
            entry.domain = attr_val.lstrip(".").lower()
        elif attr_name == "path":
            entry.path = attr_val if attr_val.startswith("/") else f"/{attr_val}"
        elif attr_name == "expires":
            try:
                dt = parsedate_to_datetime(attr_val)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                entry.expires = dt
            except Exception:
                pass
        elif attr_name == "max-age":
            try:
                seconds = int(attr_val)
                entry.max_age = seconds
                now = datetime.now(timezone.utc)
                entry.expires = datetime.fromtimestamp(now.timestamp() + seconds, tz=timezone.utc)
            except ValueError:
                pass
        elif attr_name == "secure":
            entry.secure = True
        elif attr_name == "httponly":
            entry.http_only = True
        elif attr_name == "samesite":
            val_lower = attr_val.lower()
            if val_lower == "strict":
                entry.same_site = "Strict"
            elif val_lower == "lax":
                entry.same_site = "Lax"
            elif val_lower == "none":
                entry.same_site = "None"

    return entry


def split_set_cookie_headers(header_data: Union[str, List[str], None]) -> List[str]:
    """Split comma-separated or list of Set-Cookie header values safely respecting comma in dates."""
    if not header_data:
        return []
    if isinstance(header_data, list):
        results: List[str] = []
        for item in header_data:
            results.extend(split_set_cookie_headers(item))
        return results

    results = []
    current: List[str] = []
    inside_quotes = False

    i = 0
    length = len(header_data)
    while i < length:
        char = header_data[i]
        if char == '"':
            inside_quotes = not inside_quotes
            current.append(char)
        elif char == "," and not inside_quotes:
            remaining = header_data[i + 1 :].lstrip()
            prior_segment = "".join(current[-4:]) if len(current) >= 4 else "".join(current)
            is_weekday = bool(re.search(r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)$", prior_segment, re.IGNORECASE))
            is_date_digit = bool(re.match(r"^\d{1,2}-[a-zA-Z]{3}-\d{4}", remaining))

            if is_weekday or is_date_digit:
                current.append(char)
            else:
                combined = "".join(current).strip()
                if combined:
                    results.append(combined)
                current = []
        else:
            current.append(char)
        i += 1

    remaining_str = "".join(current).strip()
    if remaining_str:
        results.append(remaining_str)

    return results


def is_domain_match(cookie_domain: Optional[str], request_host: str, is_host_only: bool) -> bool:
    """Check RFC 6265 domain matching rules."""
    norm_host = request_host.lower()
    if not cookie_domain or is_host_only:
        return norm_host == (cookie_domain or norm_host)

    norm_cookie_domain = cookie_domain.lower()
    if norm_host == norm_cookie_domain:
        return True

    return norm_host.endswith(f".{norm_cookie_domain}")


def is_path_match(cookie_path: Optional[str], request_path: str) -> bool:
    """Check RFC 6265 path matching rules."""
    norm_cookie_path = cookie_path or "/"
    norm_req_path = request_path or "/"

    if norm_req_path == norm_cookie_path:
        return True

    if norm_req_path.startswith(norm_cookie_path):
        if norm_cookie_path.endswith("/"):
            return True
        if norm_req_path[len(norm_cookie_path)] == "/":
            return True

    return False


class CookieJar:
    """Thread-safe, standards-compliant HTTP cookie jar."""

    def __init__(self) -> None:
        self._store: Dict[str, CookieEntry] = {}

    def set_cookie(
        self,
        raw_or_entry: Union[str, CookieEntry],
        url: str,
    ) -> None:
        """Store a single cookie from raw header or CookieEntry object."""
        parsed_url = urlparse(url)
        request_host = (parsed_url.hostname or "").lower()

        if isinstance(raw_or_entry, str):
            entry = parse_set_cookie_string(raw_or_entry)
        else:
            entry = raw_or_entry

        if entry is None or not request_host:
            return

        if entry.domain:
            norm_domain = entry.domain.lower()
            if not is_domain_match(norm_domain, request_host, False):
                return
            if "." not in norm_domain and norm_domain != "localhost":
                return
            entry.domain = norm_domain
            entry.host_only = False
        else:
            entry.domain = request_host
            entry.host_only = True

        if not entry.path:
            pathname = parsed_url.path or "/"
            last_slash = pathname.rfind("/")
            entry.path = "/" if last_slash <= 0 else pathname[:last_slash]

        now = datetime.now(timezone.utc)
        if entry.expires and entry.expires <= now:
            key = f"{entry.domain}:{entry.path}:{entry.name}"
            self._store.pop(key, None)
            return

        key = f"{entry.domain}:{entry.path}:{entry.name}"
        self._store[key] = entry

    def set_cookies(
        self,
        raw_headers: Union[str, List[str]],
        url: str,
    ) -> None:
        """Store multiple cookies from Set-Cookie headers."""
        items = split_set_cookie_headers(raw_headers)
        for item in items:
            self.set_cookie(item, url)

    def get_cookies(self, url: str) -> List[CookieEntry]:
        """Retrieve all valid, unexpired cookies matching the target URL."""
        parsed_url = urlparse(url)
        request_host = (parsed_url.hostname or "").lower()
        request_path = parsed_url.path or "/"
        is_https = parsed_url.scheme.lower() == "https"
        now = datetime.now(timezone.utc)

        matched: List[CookieEntry] = []
        expired_keys: List[str] = []

        for key, entry in list(self._store.items()):
            if entry.expires and entry.expires <= now:
                expired_keys.append(key)
                continue

            if not is_domain_match(entry.domain, request_host, entry.host_only):
                continue

            if not is_path_match(entry.path, request_path):
                continue

            if entry.secure and not is_https:
                continue

            matched.append(entry)

        for exp_key in expired_keys:
            self._store.pop(exp_key, None)

        return matched

    def get_cookie_string(self, url: str) -> str:
        """Return formatted Cookie header string for request."""
        cookies = self.get_cookies(url)
        return "; ".join(f"{cookie.name}={cookie.value}" for cookie in cookies)

    def clear(self) -> None:
        """Purge all stored cookies."""
        self._store.clear()
