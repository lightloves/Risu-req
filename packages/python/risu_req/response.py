import json
import zlib
from typing import Any, Dict, Generator, Iterator, List, Optional
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
        method: str = "GET",
    ) -> None:
        self.status_code = status_code
        self.status = status_code
        self.reason = reason
        self.status_text = reason
        self.headers = CaseInsensitiveDict(headers)
        self.url = url
        self.ok = 200 <= status_code < 300
        self.method = method

        self._raw_stream = raw_stream
        self._max_response_size = max_response_size
        self._decompress = decompress
        self._body_consumed = False
        self._cached_content: Optional[bytes] = None

    def stream(self, chunk_size: int = 8192) -> Generator[bytes, None, None]:
        """Yield response body in chunks while enforcing size and decompression limits."""
        if self._body_consumed:
            raise ProtocolError("Response body has already been consumed")
        self._body_consumed = True

        encoding = self.headers.get("content-encoding", "").strip().lower()
        decompressor = None
        if self._decompress and encoding:
            if encoding == "gzip":
                decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
            elif encoding == "deflate":
                decompressor = zlib.decompressobj(zlib.MAX_WBITS)

        received_bytes = 0
        decoded_chunks: List[bytes] = []

        for chunk in self._raw_stream:
            if not chunk:
                continue

            if decompressor:
                try:
                    decompressed = decompressor.decompress(chunk)
                except Exception:
                    try:
                        decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
                        decompressed = decompressor.decompress(chunk)
                    except Exception:
                        decompressed = chunk

                if decompressed:
                    received_bytes += len(decompressed)
                    if self._max_response_size and received_bytes > self._max_response_size:
                        raise ResponseSizeLimitError(
                            f"Response exceeded maximum decompressed limit of {self._max_response_size} bytes",
                            max_bytes=self._max_response_size,
                            received_bytes=received_bytes,
                            url=self.url,
                            status_code=self.status_code,
                        )
                    decoded_chunks.append(decompressed)
            else:
                received_bytes += len(chunk)
                if self._max_response_size and received_bytes > self._max_response_size:
                    raise ResponseSizeLimitError(
                        f"Response exceeded maximum size limit of {self._max_response_size} bytes",
                        max_bytes=self._max_response_size,
                        received_bytes=received_bytes,
                        url=self.url,
                        status_code=self.status_code,
                    )
                decoded_chunks.append(chunk)

        if decompressor:
            try:
                flush_tail = decompressor.flush()
                if flush_tail:
                    received_bytes += len(flush_tail)
                    if self._max_response_size and received_bytes > self._max_response_size:
                        raise ResponseSizeLimitError(
                            f"Response exceeded maximum decompressed limit of {self._max_response_size} bytes",
                            max_bytes=self._max_response_size,
                            received_bytes=received_bytes,
                            url=self.url,
                            status_code=self.status_code,
                        )
                    decoded_chunks.append(flush_tail)
            except Exception:
                pass

        full_payload = b"".join(decoded_chunks)

        if self._decompress and encoding == "br":
            try:
                import brotli

                full_payload = brotli.decompress(full_payload)
                if self._max_response_size and len(full_payload) > self._max_response_size:
                    raise ResponseSizeLimitError(
                        f"Response exceeded maximum decompressed limit of {self._max_response_size} bytes",
                        max_bytes=self._max_response_size,
                        received_bytes=len(full_payload),
                        url=self.url,
                        status_code=self.status_code,
                    )
            except Exception:
                pass

        is_body_forbidden = (
            self.status_code in (204, 304)
            or (100 <= self.status_code < 200)
            or self.method.upper() == "HEAD"
        )
        content_length_str = self.headers.get("content-length")
        if content_length_str and not encoding and not is_body_forbidden:
            try:
                expected_len = int(content_length_str)
                if len(full_payload) != expected_len:
                    raise ProtocolError(
                        f"Premature response end: expected {expected_len} bytes from Content-Length, received {len(full_payload)} bytes",
                        url=self.url,
                        status_code=self.status_code,
                    )
            except ValueError:
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
