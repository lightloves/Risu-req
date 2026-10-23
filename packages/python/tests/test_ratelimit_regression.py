import http.server
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import Any, Dict
import pytest
import risu_req
from risu_req.errors import MaxRedirectsError
from risu_req.retry import parse_rate_limit_headers, parse_retry_after


class RateLimitRegressionServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class RateLimitRegressionHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 2.0
    unauthenticated_hits = 0
    authenticated_hits = 0
    flaky_attempts = 0
    post_attempts = 0
    stream_attempts = 0
    active_concurrent = 0
    max_concurrent = 0
    lock = threading.Lock()
    peer_sockets = []

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        self.handle_req()

    def do_POST(self) -> None:
        self.handle_req()

    def do_PUT(self) -> None:
        self.handle_req()

    def handle_req(self) -> None:
        with self.lock:
            self.peer_sockets.append(self.connection.getpeername())
            self.active_concurrent += 1
            if self.active_concurrent > self.max_concurrent:
                self.max_concurrent = self.active_concurrent

        try:
            parsed = self.path.split("?")[0]

            if parsed == "/auth-redirect":
                self.send_response(302)
                self.send_header("Location", "/api/resource")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            if parsed == "/api/resource":
                auth = self.headers.get("Authorization")
                if not auth or auth != "Bearer valid-token-123":
                    with self.lock:
                        RateLimitRegressionHandler.unauthenticated_hits += 1
                    self.send_response(429)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Retry-After", "2")
                    self.send_header("X-RateLimit-Limit", "1")
                    self.send_header("X-RateLimit-Remaining", "0")
                    self.end_headers()
                    self.wfile.write(
                        json.dumps(
                            {
                                "error": "rate_limit_exceeded",
                                "message": "Unauthenticated IP rate limit exceeded",
                            }
                        ).encode()
                    )
                    return

                with self.lock:
                    RateLimitRegressionHandler.authenticated_hits += 1
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"status": "authorized_ok", "data": 42}).encode()
                )
                return

            if parsed == "/rate-limited":
                payload = json.dumps({"error": "rate_limit"}).encode()
                self.send_response(429)
                self.send_header("Content-Type", "application/json")
                self.send_header("Retry-After", "10")
                self.send_header("X-RateLimit-Limit", "60")
                self.send_header("X-RateLimit-Remaining", "0")
                self.send_header("X-RateLimit-Reset", "1700000000")
                self.send_header("X-RateLimit-Reset-After", "10")
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                self.wfile.write(payload)
                return

            if parsed == "/flaky-rl":
                with self.lock:
                    RateLimitRegressionHandler.flaky_attempts += 1
                    count = RateLimitRegressionHandler.flaky_attempts
                if count < 3:
                    self.send_response(429)
                    self.send_header("Content-Type", "text/plain")
                    self.send_header("Retry-After", "0.02")
                    self.end_headers()
                    self.wfile.write(b"rate limited")
                else:
                    payload = json.dumps({"recovered": True, "attempts": count}).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                return

            if parsed == "/post-target":
                with self.lock:
                    RateLimitRegressionHandler.post_attempts += 1
                self.send_response(429)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Retry-After", "0.01")
                self.end_headers()
                self.wfile.write(b"post rate limited")
                return

            if parsed == "/stream-target":
                with self.lock:
                    RateLimitRegressionHandler.stream_attempts += 1
                length = int(self.headers.get("Content-Length", 0))
                if length > 0:
                    _ = self.rfile.read(length)
                self.send_response(503)
                self.send_header("Retry-After", "0.01")
                self.end_headers()
                return

            if parsed == "/cycle-1":
                self.send_response(302)
                self.send_header("Location", "/cycle-2")
                self.end_headers()
                return

            if parsed == "/cycle-2":
                self.send_response(302)
                self.send_header("Location", "/cycle-1")
                self.end_headers()
                return

            if parsed == "/conc":
                time.sleep(0.05)
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"ok")
                return

            if parsed == "/secret-check":
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Set-Cookie", "session_token=secret_val; Path=/")
                self.end_headers()
                self.wfile.write(b"ok")
                return

            self.send_response(404)
            self.end_headers()

        finally:
            with self.lock:
                self.active_concurrent -= 1


@pytest.fixture(scope="module")
def regression_server():
    server = RateLimitRegressionServer(("127.0.0.1", 0), RateLimitRegressionHandler)
    port = server.server_port
    t = threading.Thread(target=server.serve_forever)
    t.daemon = True
    t.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()
    server.server_close()


def test_curl_comparison_authorized_redirect(regression_server):
    RateLimitRegressionHandler.unauthenticated_hits = 0
    RateLimitRegressionHandler.authenticated_hits = 0

    target_url = f"{regression_server}/auth-redirect"

    # 1. Run curl with identical authorized request
    curl_res = subprocess.run(
        ["curl", "-s", "-L", "-H", "Authorization: Bearer valid-token-123", target_url],
        capture_output=True,
        text=True,
        check=True,
    )
    curl_json = json.loads(curl_res.stdout)
    assert curl_json["status"] == "authorized_ok"

    # 2. Run risu-req with identical authorized request
    with risu_req.RisuClient() as client:
        res = client.get(
            target_url, headers={"Authorization": "Bearer valid-token-123"}
        )
        assert res.status_code == 200
        assert res.is_rate_limited is False
        risu_json = res.json()
        assert risu_json["status"] == "authorized_ok"

        # Compare fixture identically against curl
        assert risu_json == curl_json
        assert RateLimitRegressionHandler.unauthenticated_hits == 0


def test_rate_limit_detection_and_diagnostics(regression_server):
    with risu_req.RisuClient() as client:
        res = client.get(f"{regression_server}/rate-limited")
        assert res.status_code == 429
        assert res.is_rate_limited is True
        assert res.retry_after == 10.0

        rl = res.rate_limit
        assert rl is not None
        assert rl.is_rate_limited is True
        assert rl.retry_after == 10.0
        assert rl.limit == 60
        assert rl.remaining == 0
        assert rl.reset == 1700000000.0
        assert rl.reset_after == 10.0

        diag = res.diagnostics()
        assert diag["status_code"] == 429
        assert diag["is_rate_limited"] is True
        assert "Rate limit" in diag["cause"]
        assert "10.0s" in diag["cause"]
        res.close()


def test_retry_after_http_date_parsing():
    now = datetime.now(timezone.utc)
    future = now + timedelta(seconds=45)
    header_val = future.strftime("%a, %d %b %Y %H:%M:%S GMT")

    parsed = parse_retry_after(header_val)
    assert parsed is not None
    assert 40.0 <= parsed <= 47.0

    assert parse_retry_after("3.5") == 3.5


def test_bounded_exponential_backoff(regression_server):
    RateLimitRegressionHandler.flaky_attempts = 0
    retry_events = []

    def on_retry(info: Dict[str, Any]) -> None:
        retry_events.append(info)

    with risu_req.RisuClient(
        retries={"max_retries": 3, "backoff_factor": 0.02, "max_delay": 0.5},
        logging={"on_retry": on_retry},
    ) as client:
        res = client.get(f"{regression_server}/flaky-rl")
        assert res.status_code == 200
        data = res.json()
        assert data["recovered"] is True
        assert data["attempts"] == 3
        assert len(retry_events) == 2
        assert retry_events[0]["attempt"] == 1
        assert retry_events[1]["attempt"] == 2


def test_connection_lifecycle_socket_reuse(regression_server):
    RateLimitRegressionHandler.peer_sockets.clear()
    with risu_req.RisuClient(pool={"max_connections": 5}) as client:
        # Request 1: 429 status, body unconsumed
        r1 = client.get(f"{regression_server}/rate-limited")
        assert r1.status_code == 429
        r1.close()

        # Request 2: should reuse pooled connection
        r2 = client.get(f"{regression_server}/rate-limited")
        assert r2.status_code == 429
        r2.close()

        unique_sockets = {sock[1] for sock in RateLimitRegressionHandler.peer_sockets[-2:]}
        assert len(unique_sockets) == 1


def test_prevention_of_accidental_duplicate_post(regression_server):
    RateLimitRegressionHandler.post_attempts = 0
    with risu_req.RisuClient(retries={"max_retries": 3, "backoff_factor": 0.01}) as client:
        res = client.post(f"{regression_server}/post-target", json={"amount": 100})
        assert res.status_code == 429
        assert RateLimitRegressionHandler.post_attempts == 1
        res.close()


def test_non_replayable_stream_body_not_retried(regression_server):
    RateLimitRegressionHandler.stream_attempts = 0

    def body_generator():
        yield b"chunk1"
        yield b"chunk2"

    with risu_req.RisuClient(retries={"max_retries": 3, "backoff_factor": 0.01}) as client:
        res = client.put(f"{regression_server}/stream-target", body=body_generator())
        assert res.status_code == 503
        assert RateLimitRegressionHandler.stream_attempts == 1
        res.close()


def test_redirect_loop_detected(regression_server):
    with risu_req.RisuClient() as client:
        with pytest.raises(MaxRedirectsError):
            client.get(f"{regression_server}/cycle-1")


def test_configurable_concurrency_limits(regression_server):
    RateLimitRegressionHandler.max_concurrent = 0

    with risu_req.RisuClient(concurrency=2) as client:
        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = [
                executor.submit(client.get, f"{regression_server}/conc")
                for _ in range(6)
            ]
            for f in futures:
                res = f.result()
                assert res.status_code == 200
                res.close()

        assert RateLimitRegressionHandler.max_concurrent <= 2


def test_logging_redacts_secrets(regression_server):
    logged_request = []
    logged_response = []

    def on_req(info: Dict[str, Any]) -> None:
        logged_request.append(info)

    def on_resp(info: Dict[str, Any]) -> None:
        logged_response.append(info)

    with risu_req.RisuClient(
        logging={"on_request": on_req, "on_response": on_resp}
    ) as client:
        url = f"{regression_server}/secret-check?token=supersecret&key=apikey123"
        res = client.get(
            url,
            headers={
                "Authorization": "Bearer jwt-secret-token",
                "X-Api-Key": "my-secret-key",
                "Cookie": "session_id=sess12345",
            },
        )
        assert res.status_code == 200
        res.close()

        assert len(logged_request) >= 1
        req_headers = logged_request[0]["headers"]
        assert req_headers["Authorization"] == "[REDACTED]"
        assert req_headers["X-Api-Key"] == "[REDACTED]"
        assert req_headers["Cookie"] == "[REDACTED]"
        assert "supersecret" not in logged_request[0]["url"]
        assert "apikey123" not in logged_request[0]["url"]

        assert len(logged_response) >= 1
        resp_headers = logged_response[0]["headers"]
        cookie_val = resp_headers.get("Set-Cookie") or resp_headers.get("set-cookie")
        assert cookie_val == "[REDACTED]"
