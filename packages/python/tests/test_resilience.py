import time
import pytest
import risu_req
from risu_req.errors import MaxRedirectsError, ResponseSizeLimitError, TimeoutError
from tests.test_server import ServerRunner


@pytest.fixture(scope="module")
def local_server():
    runner = ServerRunner().start()
    yield runner
    runner.stop()


def test_timeout_enforcement(local_server):
    with risu_req.RisuClient() as client:
        with pytest.raises(TimeoutError):
            client.get(f"{local_server.url}/slow?delay=0.5", timeout=0.1)


def test_response_size_limit(local_server):
    with risu_req.RisuClient() as client:
        res = client.get(
            f"{local_server.url}/large?size=50000", max_response_size=10000
        )
        with pytest.raises(ResponseSizeLimitError):
            res.bytes()


def test_automatic_retries_on_503(local_server):
    unique_key = f"py_flaky_{time.time()}"
    with risu_req.RisuClient(retries={"max_retries": 3, "backoff_factor": 0.05}) as client:
        res = client.get(f"{local_server.url}/flaky?key={unique_key}")
        assert res.status_code == 200
        data = res.json()
        assert data["recovered"] is True
        assert data["attempts"] == 3


def test_max_redirects_loop(local_server):
    with risu_req.RisuClient(max_redirects=3) as client:
        with pytest.raises(MaxRedirectsError):
            client.get(f"{local_server.url}/redirect-loop")


def test_client_close_prevents_requests(local_server):
    client = risu_req.RisuClient()
    r = client.get(f"{local_server.url}/echo")
    assert r.status_code == 200
    client.close()

    with pytest.raises(Exception):
        client.get(f"{local_server.url}/echo")
