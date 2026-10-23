import pytest
import risu_req
from risu_req.proxy import parse_proxy_config, should_bypass_proxy
from tests.test_server import ServerRunner


@pytest.fixture(scope="module")
def target_server():
    runner = ServerRunner().start()
    yield runner
    runner.stop()


@pytest.fixture(scope="module")
def mock_proxy():
    runner = ServerRunner(is_proxy=True, auth=("pyuser", "pypass")).start()
    yield runner
    runner.stop()


def test_proxy_parsing_and_redaction():
    config = parse_proxy_config("http://user:secret@proxy.lan:8080")
    assert config is not None
    assert config.url == "http://proxy.lan:8080"
    assert config.auth.username == "user"
    assert config.auth.password == "secret"


def test_no_proxy_bypass_rules():
    bypass = ["localhost", "127.0.0.1", "*.lan", ".internal", "192.168.0.1:8080"]

    assert should_bypass_proxy("http://localhost/api", bypass) is True
    assert should_bypass_proxy("http://127.0.0.1/api", bypass) is True
    assert should_bypass_proxy("http://node.lan/api", bypass) is True
    assert should_bypass_proxy("http://sub.internal/api", bypass) is True
    assert should_bypass_proxy("http://192.168.0.1:8080/api", bypass) is True
    assert should_bypass_proxy("http://192.168.0.1:9090/api", bypass) is False
    assert should_bypass_proxy("http://example.com/api", bypass) is False


def test_proxy_authenticated_request(target_server, mock_proxy):
    with risu_req.RisuClient(
        proxy={"url": mock_proxy.url, "auth": {"username": "pyuser", "password": "pypass"}}
    ) as client:
        res = client.get(f"{target_server.url}/echo")
        assert res.status_code == 200
        data = res.json()
        assert data["method"] == "GET"


def test_proxy_auth_failure_returns_407(target_server, mock_proxy):
    with risu_req.RisuClient(
        proxy={"url": mock_proxy.url, "auth": {"username": "wrong", "password": "credentials"}}
    ) as client:
        res = client.get(f"{target_server.url}/echo")
        assert res.status_code == 407


def test_unreachable_proxy_no_silent_fallback(target_server):
    with risu_req.RisuClient(proxy="http://127.0.0.1:59998", timeout=0.5) as client:
        with pytest.raises(Exception):
            client.get(f"{target_server.url}/echo")
