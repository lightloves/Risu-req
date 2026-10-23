import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import List, Optional, Union
from risu_req.errors import ConnectionError, DnsError, TimeoutError

DEFAULT_RETRYABLE_STATUS_CODES = [429, 502, 503, 504]
DEFAULT_RETRYABLE_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]


@dataclass
class RetryPolicy:
    """Configured rules for automatic request retry with backoff and jitter."""

    max_retries: int = 3
    backoff_factor: float = 0.3
    max_delay: float = 10.0
    retry_after: bool = True
    status_codes: List[int] = field(
        default_factory=lambda: list(DEFAULT_RETRYABLE_STATUS_CODES)
    )
    retry_methods: List[str] = field(
        default_factory=lambda: list(DEFAULT_RETRYABLE_METHODS)
    )


def normalize_retry_policy(
    input_val: Union[bool, RetryPolicy, dict, None],
) -> Optional[RetryPolicy]:
    """Normalize user retry specification into a RetryPolicy instance."""
    if input_val is False or input_val is None:
        return None
    if input_val is True:
        return RetryPolicy()
    if isinstance(input_val, RetryPolicy):
        return input_val
    if isinstance(input_val, dict):
        return RetryPolicy(
            max_retries=input_val.get("max_retries", 3),
            backoff_factor=input_val.get("backoff_factor", 0.3),
            max_delay=input_val.get("max_delay", 10.0),
            retry_after=input_val.get("retry_after", True),
            status_codes=input_val.get("status_codes", DEFAULT_RETRYABLE_STATUS_CODES),
            retry_methods=input_val.get("retry_methods", DEFAULT_RETRYABLE_METHODS),
        )
    return None


def parse_retry_after(header_value: Optional[str]) -> Optional[float]:
    """Parse Retry-After header string into seconds delay."""
    if not header_value:
        return None

    raw = header_value.strip()
    try:
        seconds = float(raw)
        return max(0.0, seconds)
    except ValueError:
        pass

    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        diff = (dt - now).total_seconds()
        return max(0.0, diff)
    except Exception:
        return None


def calculate_retry_delay(
    attempt: int,
    policy: RetryPolicy,
    retry_after_header: Optional[str] = None,
) -> float:
    """Calculate exponential backoff delay with randomized jitter."""
    if policy.retry_after and retry_after_header:
        header_delay = parse_retry_after(retry_after_header)
        if header_delay is not None:
            return min(header_delay, policy.max_delay)

    base = policy.backoff_factor * (2 ** (attempt - 1))
    jitter = random.uniform(0.0, policy.backoff_factor * 0.5)
    total = base + jitter
    return min(total, policy.max_delay)


def is_retryable_method(method: str, policy: RetryPolicy) -> bool:
    """Check if the HTTP method is allowed for automatic retry."""
    normalized = [m.upper() for m in policy.retry_methods]
    return method.upper() in normalized


def is_retryable_status_code(status_code: int, policy: RetryPolicy) -> bool:
    """Check if the received HTTP response status code should trigger retry."""
    return status_code in policy.status_codes


def is_retryable_exception(exc: Exception) -> bool:
    """Check if the network or timeout exception is safe to retry."""
    return isinstance(exc, (TimeoutError, ConnectionError, DnsError))
