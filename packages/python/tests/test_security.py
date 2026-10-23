import pytest
import risu_req
from risu_req.errors import ProtocolError, SsrfError
from risu_req.security import (
    redact_headers_for_logging,
    redact_url_for_logging,
    sanitize_redirect_headers,
    validate_header,
    validate_url,
)
from risu_req.ssrf import is_private_ip
from tests.test_server import ServerRunner


@pytest.fixture(scope="module")
def local_server():
    runner = ServerRunner().start()
    yield runner
    runner.stop()


def test_reject_unsupported_protocols():
    with pytest.raises(ProtocolError):
        validate_url("file:///etc/hosts")

    with pytest.raises(ProtocolError):
        validate_url("ftp://example.com/file")


def test_reject_crlf_in_url():
    with pytest.raises(ProtocolError):
        validate_url("http://example.com/api\r\nX-Injected: true")


def test_validate_header():
    validate_header("X-Custom", "valid")

    with pytest.raises(ProtocolError):
        validate_header("Bad Header Name", "val")

    with pytest.raises(ProtocolError):
        validate_header("X-Inject", "line1\r\nInjected: true")


def test_is_private_ip():
    assert is_private_ip("127.0.0.1") is True
    assert is_private_ip("10.1.2.3") is True
    assert is_private_ip("172.16.5.10") is True
    assert is_private_ip("192.168.1.1") is True
    assert is_private_ip("169.254.1.1") is True
    assert is_private_ip("::1") is True
    assert is_private_ip("fc00::1") is True
    assert is_private_ip("8.8.8.8") is False
    assert is_private_ip("1.1.1.1") is False


def test_ssrf_protection_blocks_private():
    with risu_req.RisuClient(ssrf_protection=True) as client:
        with pytest.raises(SsrfError):
            client.get("http://127.0.0.1:8080/test")

        with pytest.raises(SsrfError):
            client.get("http://localhost:8080/test")


def test_cross_origin_redirect_header_stripping():
    hdrs = {
        "Authorization": "Bearer secret",
        "Cookie": "token=123",
        "X-Public": "allowed",
    }
    same = sanitize_redirect_headers(hdrs, "http://example.com/a", "http://example.com/b")
    assert "Authorization" in same
    assert "Cookie" in same

    diff = sanitize_redirect_headers(hdrs, "http://example.com/a", "http://other.org/b")
    assert "Authorization" not in diff
    assert "Cookie" not in diff
    assert diff["X-Public"] == "allowed"


def test_insecure_downgrade_blocked():
    with pytest.raises(ProtocolError):
        sanitize_redirect_headers(
            {},
            "https://secure.example.com",
            "http://insecure.example.com",
            allow_insecure_downgrade=False,
        )


def test_logging_redaction():
    headers = {
        "Authorization": "Bearer token123",
        "Cookie": "session=xyz",
        "X-Api-Key": "key999",
        "Content-Type": "application/json",
    }
    redacted = redact_headers_for_logging(headers)
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["Cookie"] == "[REDACTED]"
    assert redacted["X-Api-Key"] == "[REDACTED]"
    assert redacted["Content-Type"] == "application/json"

    url_str = "https://user:mypassword@example.com/search?token=secrettoken&q=query"
    red_url = redact_url_for_logging(url_str)
    assert "mypassword" not in red_url
    assert "user:***@" in red_url
    assert "secrettoken" not in red_url
    assert "token=***" in red_url
    assert "q=query" in red_url


def test_safe_redirect_execution(local_server):
    with risu_req.RisuClient() as client:
        res = client.get(
            f"{local_server.url}/redirect-start?target={local_server.url}/redirect-target"
        )
        assert res.status_code == 200
        assert res.json()["success"] is True
