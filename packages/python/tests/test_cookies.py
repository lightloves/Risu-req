import pytest
import risu_req
from risu_req.cookies import CookieJar
from tests.test_server import ServerRunner


@pytest.fixture(scope="module")
def local_server():
    runner = ServerRunner().start()
    yield runner
    runner.stop()


def test_host_only_cookie_matching():
    jar = CookieJar()
    jar.set_cookie("token=alpha; Path=/", "http://example.com/api")

    matched = jar.get_cookies("http://example.com/api")
    assert len(matched) == 1
    assert matched[0].name == "token"
    assert matched[0].value == "alpha"

    sub_matched = jar.get_cookies("http://sub.example.com/api")
    assert len(sub_matched) == 0

    other_matched = jar.get_cookies("http://unrelated.org/api")
    assert len(other_matched) == 0


def test_domain_attribute_subdomain_matching():
    jar = CookieJar()
    jar.set_cookie("shared=global; Domain=example.com; Path=/", "http://example.com")

    root = jar.get_cookies("http://example.com/feed")
    assert len(root) == 1

    sub = jar.get_cookies("http://api.example.com/feed")
    assert len(sub) == 1

    unrelated = jar.get_cookies("http://other.com/feed")
    assert len(unrelated) == 0


def test_path_matching_rules():
    jar = CookieJar()
    jar.set_cookie("auth=ok; Path=/app", "http://example.com")

    assert len(jar.get_cookies("http://example.com/app")) == 1
    assert len(jar.get_cookies("http://example.com/app/profile")) == 1
    assert len(jar.get_cookies("http://example.com/apple")) == 0
    assert len(jar.get_cookies("http://example.com/")) == 0


def test_secure_flag():
    jar = CookieJar()
    jar.set_cookie("secret=val; Secure; Path=/", "https://example.com")

    assert len(jar.get_cookies("https://example.com")) == 1
    assert len(jar.get_cookies("http://example.com")) == 0


def test_max_age_expiry():
    jar = CookieJar()
    jar.set_cookie("stale=val; Max-Age=0; Path=/", "http://example.com")
    assert len(jar.get_cookies("http://example.com")) == 0

    jar.set_cookie("fresh=val; Max-Age=3600; Path=/", "http://example.com")
    assert len(jar.get_cookies("http://example.com")) == 1


def test_client_cookie_integration(local_server):
    with risu_req.RisuClient(cookies=True) as client:
        r1 = client.get(f"{local_server.url}/cookies")
        assert r1.json()["receivedCookie"] == ""

        r2 = client.get(f"{local_server.url}/cookies")
        rec = r2.json()["receivedCookie"]
        assert "session_id=py123xyz" in rec
        assert "theme=light" in rec
