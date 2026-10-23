import gzip
import json
import zlib
from typing import Any, Dict, Generator, Iterator, Optional, Union
from risu_req.errors import ProtocolError, ResponseSizeLimitError


class CaseInsensitiveDict(dict):
    """Dictionary that normalizes all key lookups to lowercase."""

    def __init__(self, data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__()
        if data:
            for k, v in data.items():
                self[k] = v

    def __setitem__(self, key: str, value: Any) -> None:
        super().__setitem__(key.lower(), value)

    def __getitem__(self, key: str) -> Any:
        return super().__getitem__(key.lower())

    def __contains__(self, key: object) -> bool:
        if isinstance(key, str):
            return super().__contains__(key.lower())
        return False

    def get(self, key: str, default: Any = None) -> Any:
        return super().get(key.lower(), default)

    def pop(self, key: str, default: Any = None) -> Any:
        return super().pop(key.lower(), default)


class RisuResponse:
    """HTTP response container providing synchronous access to body and metadata."""

    def __init__(
        self,
        status_code: int,
        reason: str,
        headers: Dict[str, str],
        url: str,
        raw_stream: Iterator[bytes],
        max_response_size: Optional[int] = None,
        decompress: bool = True,
    ) -> None:
        self.status_code = status_code
        self.status = status_code
        self.reason = reason
        self.status_text = reason
        self.headers = CaseInsensitiveDict(headers)
        self.url = url
        self.ok = 200 <= status_code < 300

        self._raw_stream = raw_stream
        self._max_response_size = max_response_size
        self._decompress = decompress
        self._body_consumed = False
        self._cached_content: Optional[bytes] = None

    def stream(self, chunk_size: int = 8192) -> Generator[bytes, None, None]:
        """Yield response body in chunks while enforcing size limits."""
        if self._body_consumed:
            raise ProtocolError("Response body has already been consumed")
        self._body_consumed = True

        received_bytes = 0
        raw_chunks: List[bytes] = []

        for chunk in self._raw_stream:
            if not chunk:
                continue
            received_bytes += len(chunk)
            if self._max_response_size and received_bytes > self._max_response_size:
                raise ResponseSizeLimitError(
                    f"Response exceeded maximum size limit of {self._max_response_size} bytes",
                    max_bytes=self._max_response_size,
                    received_bytes=received_bytes,
                    url=self.url,
                    status_code=self.status_code,
                )
            raw_chunks.append(chunk)

        full_payload = b"".join(raw_chunks)

        if self._decompress:
            encoding = self.headers.get("content-encoding", "").strip().lower()
            if encoding == "gzip":
                try:
                    full_payload = gzip.decompress(full_payload)
                except Exception:
                    pass
            elif encoding == "deflate":
                try:
                    full_payload = zlib.decompress(full_payload)
                except Exception:
                    try:
                        full_payload = zlib.decompress(full_payload, -zlib.MAX_WBITS)
                    except Exception:
                        pass
            elif encoding == "br":
                try:
                    import brotli

                    full_payload = brotli.decompress(full_payload)
                except Exception:
                    pass

        self._cached_content = full_payload

        for idx in range(0, len(full_payload), chunk_size):
            yield full_payload[idx : idx + chunk_size]

    def bytes(self) -> bytes:
        """Return the complete decoded response payload as bytes."""
        if self._cached_content is not None:
            return self._cached_content
        for _ in self.stream():
            pass
        return self._cached_content or b""

    @property
    def content(self) -> bytes:
        """Return the complete decoded response payload as bytes."""
        return self.bytes()

    @property
    def text(self) -> str:
        """Return the response body decoded as a UTF-8 string."""
        raw = self.bytes()
        return raw.decode("utf-8", errors="replace")

    def json(self) -> Any:
        """Parse response payload as JSON."""
        body_text = self.text
        try:
            return json.loads(body_text)
        except Exception as exc:
            raise ProtocolError(
                f"Failed to parse response body as JSON: {exc}",
                url=self.url,
                status_code=self.status_code,
                cause=exc,
            )
