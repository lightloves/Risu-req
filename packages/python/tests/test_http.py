import pytest
import risu_req
from tests.test_server import ServerRunner


@pytest.fixture(scope="module")
def local_server():
    runner = ServerRunner().start()
    yield runner
    runner.stop()


def test_convenience_get(local_server):
    res = risu_req.get(f"{local_server.url}/echo?client=risu")
    assert res.status_code == 200
    assert res.ok is True
    data = res.json()
    assert data["method"] == "GET"
    assert "/echo?client=risu" in data["url"]


def test_post_json(local_server):
    res = risu_req.post(f"{local_server.url}/json", json={"key": "value", "count": 42})
    assert res.status_code == 200
    data = res.json()
    assert data["received"] == {"key": "value", "count": 42}


def test_put_form(local_server):
    with risu_req.RisuClient() as client:
        res = client.put(f"{local_server.url}/echo", form={"user": "bob", "active": "true"})
        assert res.status_code == 200
        data = res.json()
        assert data["method"] == "PUT"
        assert "application/x-www-form-urlencoded" in data["headers"]["Content-Type"]
        assert "user=bob" in data["body"]


def test_patch_raw_body(local_server):
    res = risu_req.patch(
        f"{local_server.url}/echo",
        body="plain text content",
        headers={"Content-Type": "text/plain"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["method"] == "PATCH"
    assert data["body"] == "plain text content"


def test_delete_verb(local_server):
    res = risu_req.delete(f"{local_server.url}/echo")
    assert res.status_code == 200
    data = res.json()
    assert data["method"] == "DELETE"


def test_head_verb(local_server):
    res = risu_req.head(f"{local_server.url}/echo")
    assert res.status_code == 200
    assert "content-type" in res.headers
    assert res.text == ""


def test_options_verb(local_server):
    res = risu_req.options(f"{local_server.url}/echo")
    assert res.status_code == 200
    data = res.json()
    assert data["method"] == "OPTIONS"


def test_multipart_upload(local_server):
    res = risu_req.post(
        f"{local_server.url}/echo",
        files={"field1": "text-value", "upload": ("doc.txt", b"binary content")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "multipart/form-data" in data["headers"]["Content-Type"]
    assert "field1" in data["body"]
    assert "doc.txt" in data["body"]


def test_streaming_download(local_server):
    res = risu_req.get(f"{local_server.url}/large?size=16384")
    assert res.status_code == 200
    chunks = list(res.stream(chunk_size=4096))
    assert len(chunks) == 4
    total_bytes = b"".join(chunks)
    assert len(total_bytes) == 16384


def test_transparent_gzip(local_server):
    res = risu_req.get(f"{local_server.url}/gzip")
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "python gzip payload"
    assert data["valid"] is True


def test_transparent_deflate(local_server):
    res = risu_req.get(f"{local_server.url}/deflate")
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "python deflate payload"
